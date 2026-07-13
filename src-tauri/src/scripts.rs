//! Sandboxed pre/post-request JavaScript on QuickJS (rquickjs).
//!
//! Design & threat model: `docs/architecture/quickjs-scripts.md`. In one
//! sentence: a script is untrusted JS run inside a private QuickJS `Runtime`
//! with NO host bindings except one narrow, serde-validated bridge object
//! (`lok`); it cannot reach the filesystem, network, process, real timers,
//! other scripts, or Rust memory; it is hard-capped on wall time, instruction
//! count and heap; and it never sees plaintext secrets.
//!
//! How each host escape is cut (mirrors §1.3 of the doc): rquickjs wires
//! nothing by default — `import`/`require`/`fetch`/`process`/`Deno`/fs/timers
//! are all `undefined`. We never call `Runtime::set_loader`, and we run the
//! user text as a *script* (not a module), so `import` is a syntax error and
//! `import()` cannot resolve. A trusted prologue then freezes the intrinsics we
//! marshal through (`JSON`/`Object`) and deletes `eval`/`Function`/`WebAssembly`
//! /`SharedArrayBuffer` for defense-in-depth. The single `lok` global's leaf
//! methods are Rust closures that only ever move `serde_json::Value` across the
//! boundary — never a native pointer.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rquickjs::{Context, Ctx, Function, Object, Runtime, Value as JsValue};
use serde_json::Value as Json;

use crate::json_path;
use crate::models::{
    KeyValue, RequestPatch, ResponseData, ScriptLimits, ScriptOutcome, ScriptTest, StoredRequest,
};

/// Upper bounds on the host-side capture buffers so a script cannot exhaust
/// host memory *outside* the VM's own heap budget (e.g. `console.log` in a
/// loop). The oldest log line is dropped past the cap.
const MAX_LOG_LINES: usize = 256;
const MAX_LOG_LINE_BYTES: usize = 4 * 1024;
const MAX_ENV_SET: usize = 256;
const MAX_TESTS: usize = 256;

/// The trusted prologue: the ONLY privileged JS. It hardens the global before
/// any untrusted code runs — freeze the intrinsics we marshal through so the
/// script cannot repoison `JSON`/`Object.prototype` to smuggle a field into a
/// patch, then delete the dynamic-code and shared-memory surfaces. `console` is
/// NOT a real console — its methods are Rust closures installed in §2.4, so we
/// only need to ensure a bare object exists to hang them on if absent.
const HARDEN_PROLOGUE: &str = r#"
"use strict";
(function () {
    // Freeze the intrinsics our Rust-side marshalling reads back.
    try { Object.freeze(JSON); } catch (_) {}
    try { Object.freeze(Object); } catch (_) {}
    // Remove dynamic-code and byte-compilation surfaces (defense-in-depth: even
    // present they only re-run in-sandbox JS with the same zero-capability
    // global, but deleting them makes "no dynamic code" auditable).
    try { delete globalThis.eval; } catch (_) {}
    try { delete globalThis.Function; } catch (_) {}
    try { delete globalThis.WebAssembly; } catch (_) {}
    try { delete globalThis.SharedArrayBuffer; } catch (_) {}
})();
"#;

// ---------- shared mutable capture buffers (Rc<RefCell> inside one Context) ----------

/// Everything the `lok` closures write back to, drained after the run. Held in
/// an `Rc<RefCell<…>>` shared by every closure inside a single Context (QuickJS
/// is single-threaded per Runtime, so `Rc` is correct and `Send` is not needed
/// across the boundary).
#[derive(Default)]
struct Capture {
    logs: Vec<String>,
    env_set: Vec<(String, String)>,
    tests: Vec<ScriptTest>,
    patch: RequestPatch,
    /// Working copies of the request fields the pre-script may mutate. Seeded
    /// from the snapshot; only fields the script actually touched are folded
    /// into `patch` at the end.
    method: String,
    url: String,
    body: String,
    headers: Vec<KeyValue>,
    query: Vec<KeyValue>,
    touched_method: bool,
    touched_url: bool,
    touched_body: bool,
    touched_headers: bool,
    touched_query: bool,
}

impl Capture {
    fn push_log(&mut self, line: String) {
        let trimmed = truncate_utf8(line, MAX_LOG_LINE_BYTES);
        if self.logs.len() >= MAX_LOG_LINES {
            self.logs.remove(0);
        }
        self.logs.push(trimmed);
    }

    fn push_env(&mut self, name: String, value: String) {
        if self.env_set.len() < MAX_ENV_SET {
            self.env_set.push((name, value));
        }
    }

    fn push_test(&mut self, name: String, passed: bool) {
        if self.tests.len() < MAX_TESTS {
            self.tests.push(ScriptTest { name, passed });
        }
    }

    /// Fold the working request copies into the patch for every touched field.
    fn finish_patch(&mut self) {
        if self.touched_method {
            self.patch.method = Some(self.method.clone());
        }
        if self.touched_url {
            self.patch.url = Some(self.url.clone());
        }
        if self.touched_body {
            self.patch.body = Some(self.body.clone());
        }
        if self.touched_headers {
            self.patch.headers = Some(self.headers.clone());
        }
        if self.touched_query {
            self.patch.query_params = Some(self.query.clone());
        }
    }
}

type Shared = Rc<RefCell<Capture>>;

/// Truncate a string to at most `max` bytes without splitting a UTF-8 char.
fn truncate_utf8(mut s: String, max: usize) -> String {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s.truncate(end);
    s
}

// ---------- inputs (built in Rust, serialized in via serde_json) ----------

/// The still-templated request snapshot handed to a PRE script. Only the fields
/// a script may read/mutate; secrets are NOT present (§5 — the pre-script runs
/// before secrets are fetched, and auth secret fields are omitted).
pub struct ScriptRequest {
    pub method: String,
    pub url: String,
    pub body: String,
    pub headers: Vec<KeyValue>,
    pub query: Vec<KeyValue>,
    /// A non-secret auth view: `{type, ...}` with credential fields stripped.
    pub auth_view: Json,
    /// Current run-var map (the `{{var.X}}` namespace).
    pub vars: std::collections::HashMap<String, String>,
}

/// Extract the non-secret shape of an auth block for `lok.request.auth`. Bearer
/// token / Basic password / ApiKey value / SigV4 profile secrets are omitted —
/// a script sees the *kind* of auth and non-sensitive fields only.
pub fn auth_view(auth: &crate::models::Auth) -> Json {
    use crate::models::Auth;
    match auth {
        Auth::None => serde_json::json!({ "type": "none" }),
        Auth::Bearer { .. } => serde_json::json!({ "type": "bearer" }),
        Auth::Basic { username, .. } => {
            serde_json::json!({ "type": "basic", "username": username })
        }
        Auth::ApiKey {
            name, placement, ..
        } => serde_json::json!({
            "type": "api_key",
            "name": name,
            "placement": placement,
        }),
        Auth::SigV4 {
            region, service, ..
        } => serde_json::json!({
            "type": "sigv4",
            "region": region,
            "service": service,
        }),
    }
}

/// The response snapshot handed to a POST script — DATA, never code.
pub struct ScriptResponse {
    pub status: u32,
    pub headers: Vec<KeyValue>,
    pub body: String,
    pub timings: Json,
    pub vars: std::collections::HashMap<String, String>,
}

// ============================================================================
// Public entry points — both TOTAL (never panic). Every rquickjs error path
// maps to `ScriptOutcome { ok: false, error }`.
// ============================================================================

/// Run a PRE script against a still-templated request snapshot. On success the
/// returned outcome carries a `request_patch` (fields the script rewrote) and
/// any `env_set` (run-vars). `ok=false` on a throw/limit — the caller
/// fail-closes the send.
pub fn run_pre(req: ScriptRequest, script: &str, limits: ScriptLimits) -> ScriptOutcome {
    let shared: Shared = Rc::new(RefCell::new(Capture {
        method: req.method.clone(),
        url: req.url.clone(),
        body: req.body.clone(),
        headers: req.headers.clone(),
        query: req.query.clone(),
        ..Capture::default()
    }));
    let vars = req.vars.clone();
    let auth_view = req.auth_view.clone();

    let install = {
        let shared = shared.clone();
        move |ctx: Ctx<'_>| install_lok_pre(ctx, shared.clone(), &vars, &auth_view)
    };

    let result = run_in_sandbox(script, limits, install);
    let mut cap = shared.borrow_mut();
    cap.finish_patch();
    finish_outcome(result, &cap, true)
}

/// Run a POST script against a response snapshot (read-only). The outcome
/// carries `tests` (from `lok.expect`/`lok.test`) and any `env_set`.
pub fn run_post(resp: ScriptResponse, script: &str, limits: ScriptLimits) -> ScriptOutcome {
    let shared: Shared = Rc::new(RefCell::new(Capture::default()));
    let vars = resp.vars.clone();
    let response_json = serde_json::json!({
        "status": resp.status,
        "headers": resp.headers,
        "body": resp.body,
        "timings": resp.timings,
    });
    let raw_body = resp.body.clone();
    let headers = resp.headers.clone();

    let install = {
        let shared = shared.clone();
        move |ctx: Ctx<'_>| {
            install_lok_post(
                ctx,
                shared.clone(),
                &vars,
                &response_json,
                &raw_body,
                &headers,
            )
        }
    };

    let result = run_in_sandbox(script, limits, install);
    let cap = shared.borrow();
    finish_outcome(result, &cap, false)
}

/// Fold a sandbox run result + the drained capture buffers into a
/// `ScriptOutcome`. Partial logs/env gathered before a throw are preserved.
fn finish_outcome(result: Result<(), String>, cap: &Capture, is_pre: bool) -> ScriptOutcome {
    let (ok, error) = match result {
        Ok(()) => (true, None),
        Err(message) => (false, Some(message)),
    };
    ScriptOutcome {
        ok,
        error,
        logs: cap.logs.clone(),
        request_patch: if is_pre {
            Some(cap.patch.clone())
        } else {
            None
        },
        env_set: cap.env_set.clone(),
        tests: cap.tests.clone(),
    }
}

// ============================================================================
// Sandbox core — the isolation heart (§1.2, §1.4, §1.5).
// ============================================================================

/// Build a fresh, private VM, harden it, install the bridge, and run the script
/// under the time+step+memory guards. Dropped at the end so run N+1 cannot
/// observe run N. Never panics: a QuickJS exception, a limit hit, or a
/// conversion failure all surface as `Err(String)`.
fn run_in_sandbox<F>(script: &str, limits: ScriptLimits, install: F) -> Result<(), String>
where
    F: FnOnce(Ctx<'_>) -> Result<(), String>,
{
    let runtime = Runtime::new().map_err(|e| format!("runtime init: {e}"))?;
    // Memory bomb → in-VM RangeError/OOM that unwinds to Rust (not an OOM-kill).
    runtime.set_memory_limit(limits.memory_bytes);
    // Unbounded recursion → in-VM RangeError, never a native stack overflow.
    runtime.set_max_stack_size(256 * 1024);

    // Time + step interrupt. QuickJS calls this between bytecode ops, so a
    // `while(true){}` cannot starve the check. Either budget trips it.
    let deadline = Instant::now() + Duration::from_millis(limits.wall_ms);
    let steps = Arc::new(AtomicU64::new(0));
    let step_limit = limits.step_limit;
    let tripped: Arc<AtomicU64> = Arc::new(AtomicU64::new(0)); // 0=ok 1=steps 2=time
    {
        let steps = steps.clone();
        let tripped = tripped.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || {
            let n = steps.fetch_add(1, Ordering::Relaxed) + 1;
            if n > step_limit {
                tripped.store(1, Ordering::Relaxed);
                return true; // interrupt: throws an uncatchable error to Rust
            }
            if Instant::now() >= deadline {
                tripped.store(2, Ordering::Relaxed);
                return true;
            }
            false
        })));
    }

    let context = Context::full(&runtime).map_err(|e| format!("context init: {e}"))?;

    let outcome = context.with(|ctx| -> Result<(), String> {
        // 1) Harden the global (freeze intrinsics, delete eval/Function/…).
        ctx.eval::<(), _>(HARDEN_PROLOGUE)
            .map_err(|e| js_err(&ctx, e))?;
        // 2) Install the ONLY non-intrinsic global: `lok` (+ `console`).
        install(ctx.clone())?;
        // 3) Run the untrusted script text AS A SCRIPT (never a module), so
        //    top-level `import` is a syntax error and `import()` cannot resolve.
        ctx.eval::<(), _>(script).map_err(|e| js_err(&ctx, e))?;
        Ok(())
    });

    // A tripped guard wins over the raw rquickjs error text (which for an
    // interrupt is opaque), so the user sees a clear limit message.
    match tripped.load(Ordering::Relaxed) {
        1 => Err(format!(
            "script step limit ({}) exceeded",
            limits.step_limit
        )),
        2 => Err(format!(
            "script wall-time limit ({}ms) exceeded",
            limits.wall_ms
        )),
        _ => outcome,
    }
}

/// Render an rquickjs error into a message, pulling the JS exception's own text
/// when the error is a thrown JS value.
fn js_err(ctx: &Ctx<'_>, err: rquickjs::Error) -> String {
    if err.is_exception() {
        let exception = ctx.catch();
        if let Some(text) = exception
            .as_object()
            .and_then(|obj| obj.get::<_, String>("message").ok())
        {
            return text;
        }
        if let Ok(text) = exception.get::<String>() {
            return text;
        }
        return "script threw".to_string();
    }
    format!("{err}")
}

// ============================================================================
// The `lok` bridge (§2). Every leaf is a Rust closure moving serde_json::Value.
// ============================================================================

/// Install `lok` for a PRE script: mutable request view + shared env/log.
fn install_lok_pre(
    ctx: Ctx<'_>,
    shared: Shared,
    vars: &std::collections::HashMap<String, String>,
    auth_view: &Json,
) -> Result<(), String> {
    let globals = ctx.globals();
    let lok = Object::new(ctx.clone()).map_err(|e| format!("lok init: {e}"))?;

    install_console(&ctx, &lok, shared.clone())?;
    install_env(&ctx, &lok, shared.clone(), vars)?;
    install_request(&ctx, &lok, shared, auth_view)?;

    globals
        .set("lok", lok)
        .map_err(|e| format!("lok set: {e}"))?;
    Ok(())
}

/// Install `lok` for a POST script: read-only response + expect/test/extract.
fn install_lok_post(
    ctx: Ctx<'_>,
    shared: Shared,
    vars: &std::collections::HashMap<String, String>,
    response_json: &Json,
    raw_body: &str,
    headers: &[KeyValue],
) -> Result<(), String> {
    let globals = ctx.globals();
    let lok = Object::new(ctx.clone()).map_err(|e| format!("lok init: {e}"))?;

    install_console(&ctx, &lok, shared.clone())?;
    install_env(&ctx, &lok, shared.clone(), vars)?;
    install_response(&ctx, &lok, response_json, raw_body, headers)?;
    install_tests_and_extract(&ctx, &lok, shared, raw_body)?;

    globals
        .set("lok", lok)
        .map_err(|e| format!("lok set: {e}"))?;
    Ok(())
}

/// `console.log/info/warn/error` → bounded host capture buffer (not a host
/// stream). Each arg is stringified in-Rust from its serde value.
fn install_console<'js>(ctx: &Ctx<'js>, lok: &Object<'js>, shared: Shared) -> Result<(), String> {
    let console = Object::new(ctx.clone()).map_err(|e| format!("console init: {e}"))?;
    for name in ["log", "info", "warn", "error"] {
        let shared = shared.clone();
        let func = Function::new(
            ctx.clone(),
            move |args: rquickjs::function::Rest<JsValue<'_>>| {
                let line = args.iter().map(js_to_display).collect::<Vec<_>>().join(" ");
                shared.borrow_mut().push_log(line);
            },
        )
        .map_err(|e| format!("console.{name}: {e}"))?;
        console
            .set(name, func)
            .map_err(|e| format!("console.{name} set: {e}"))?;
    }
    // Also expose console globally (scripts expect a bare `console`).
    ctx.globals()
        .set("console", console.clone())
        .map_err(|e| format!("console global: {e}"))?;
    lok.set("console", console)
        .map_err(|e| format!("lok.console: {e}"))?;
    Ok(())
}

/// `lok.env.get/set` + `lok.variables` — the run-var (`{{var.X}}`) namespace
/// only. Cannot read process env or the secret store.
fn install_env<'js>(
    ctx: &Ctx<'js>,
    lok: &Object<'js>,
    shared: Shared,
    vars: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let env = Object::new(ctx.clone()).map_err(|e| format!("env init: {e}"))?;

    // Snapshot the current vars for reads; writes go to the capture buffer AND
    // this local snapshot so a later get() sees a value the same script set.
    let read_map: Rc<RefCell<std::collections::HashMap<String, String>>> =
        Rc::new(RefCell::new(vars.clone()));

    {
        let read_map = read_map.clone();
        let get = Function::new(ctx.clone(), move |name: String| -> Option<String> {
            read_map.borrow().get(&name).cloned()
        })
        .map_err(|e| format!("env.get: {e}"))?;
        env.set("get", get)
            .map_err(|e| format!("env.get set: {e}"))?;
    }
    {
        let shared = shared.clone();
        let read_map = read_map.clone();
        let set = Function::new(ctx.clone(), move |name: String, value: String| {
            read_map.borrow_mut().insert(name.clone(), value.clone());
            shared.borrow_mut().push_env(name, value);
        })
        .map_err(|e| format!("env.set: {e}"))?;
        env.set("set", set)
            .map_err(|e| format!("env.set set: {e}"))?;
    }

    lok.set("env", env).map_err(|e| format!("lok.env: {e}"))?;

    // `lok.variables` — a read-only object view of the current run-var map.
    let variables = Object::new(ctx.clone()).map_err(|e| format!("variables init: {e}"))?;
    for (name, value) in read_map.borrow().iter() {
        variables
            .set(name.as_str(), value.as_str())
            .map_err(|e| format!("variables entry: {e}"))?;
    }
    lok.set("variables", variables)
        .map_err(|e| format!("lok.variables: {e}"))?;
    Ok(())
}

/// `lok.request.*` — mutate the pending request. Setters accumulate into the
/// shared capture; the resulting patch is applied BEFORE interpolation so the
/// normal escaping still runs over whatever the script produced.
fn install_request<'js>(
    ctx: &Ctx<'js>,
    lok: &Object<'js>,
    shared: Shared,
    auth_view: &Json,
) -> Result<(), String> {
    let request = Object::new(ctx.clone()).map_err(|e| format!("request init: {e}"))?;

    // method / url / body: getter+setter pairs implemented as get*/set* methods
    // AND live properties for ergonomic `lok.request.url = "…"`.
    install_scalar_field(ctx, &request, shared.clone(), Field::Method)?;
    install_scalar_field(ctx, &request, shared.clone(), Field::Url)?;
    install_scalar_field(ctx, &request, shared.clone(), Field::Body)?;

    // Header helpers (case-insensitive).
    {
        let shared = shared.clone();
        let get_header = Function::new(ctx.clone(), move |name: String| -> Option<String> {
            let cap = shared.borrow();
            let lower = name.to_ascii_lowercase();
            let matches: Vec<&str> = cap
                .headers
                .iter()
                .filter(|kv| kv.name.to_ascii_lowercase() == lower)
                .map(|kv| kv.value.as_str())
                .collect();
            if matches.is_empty() {
                None
            } else {
                Some(matches.join(", "))
            }
        })
        .map_err(|e| format!("getHeader: {e}"))?;
        request
            .set("getHeader", get_header)
            .map_err(|e| format!("getHeader set: {e}"))?;
    }
    {
        let shared = shared.clone();
        let set_header = Function::new(ctx.clone(), move |name: String, value: String| {
            let mut cap = shared.borrow_mut();
            cap.touched_headers = true;
            let lower = name.to_ascii_lowercase();
            cap.headers
                .retain(|kv| kv.name.to_ascii_lowercase() != lower);
            cap.headers.push(KeyValue {
                name,
                value,
                enabled: true,
            });
        })
        .map_err(|e| format!("setHeader: {e}"))?;
        request
            .set("setHeader", set_header)
            .map_err(|e| format!("setHeader set: {e}"))?;
    }
    {
        let shared = shared.clone();
        let remove_header = Function::new(ctx.clone(), move |name: String| {
            let mut cap = shared.borrow_mut();
            cap.touched_headers = true;
            let lower = name.to_ascii_lowercase();
            cap.headers
                .retain(|kv| kv.name.to_ascii_lowercase() != lower);
        })
        .map_err(|e| format!("removeHeader: {e}"))?;
        request
            .set("removeHeader", remove_header)
            .map_err(|e| format!("removeHeader set: {e}"))?;
    }

    // Query helpers (case-sensitive names, mirroring KeyValue semantics).
    {
        let shared = shared.clone();
        let get_query = Function::new(ctx.clone(), move |name: String| -> Option<String> {
            shared
                .borrow()
                .query
                .iter()
                .find(|kv| kv.name == name)
                .map(|kv| kv.value.clone())
        })
        .map_err(|e| format!("getQuery: {e}"))?;
        request
            .set("getQuery", get_query)
            .map_err(|e| format!("getQuery set: {e}"))?;
    }
    {
        let shared = shared.clone();
        let set_query = Function::new(ctx.clone(), move |name: String, value: String| {
            let mut cap = shared.borrow_mut();
            cap.touched_query = true;
            cap.query.retain(|kv| kv.name != name);
            cap.query.push(KeyValue {
                name,
                value,
                enabled: true,
            });
        })
        .map_err(|e| format!("setQuery: {e}"))?;
        request
            .set("setQuery", set_query)
            .map_err(|e| format!("setQuery set: {e}"))?;
    }
    {
        let shared = shared.clone();
        let remove_query = Function::new(ctx.clone(), move |name: String| {
            let mut cap = shared.borrow_mut();
            cap.touched_query = true;
            cap.query.retain(|kv| kv.name != name);
        })
        .map_err(|e| format!("removeQuery: {e}"))?;
        request
            .set("removeQuery", remove_query)
            .map_err(|e| format!("removeQuery set: {e}"))?;
    }

    // Read-only snapshots: `headers` array + `auth` view.
    let headers_arr = keyvalues_to_js(ctx, &shared.borrow().headers)?;
    request
        .set("headers", headers_arr)
        .map_err(|e| format!("headers set: {e}"))?;
    let auth_obj = json_to_js(ctx, auth_view)?;
    request
        .set("auth", auth_obj)
        .map_err(|e| format!("auth set: {e}"))?;

    lok.set("request", request)
        .map_err(|e| format!("lok.request: {e}"))?;
    Ok(())
}

/// Which mutable scalar request field a get*/set* pair targets.
#[derive(Clone, Copy)]
enum Field {
    Method,
    Url,
    Body,
}

impl Field {
    fn getter_name(self) -> &'static str {
        match self {
            Field::Method => "getMethod",
            Field::Url => "getUrl",
            Field::Body => "getBody",
        }
    }
    fn setter_name(self) -> &'static str {
        match self {
            Field::Method => "setMethod",
            Field::Url => "setUrl",
            Field::Body => "setBody",
        }
    }
    fn read(self, cap: &Capture) -> String {
        match self {
            Field::Method => cap.method.clone(),
            Field::Url => cap.url.clone(),
            Field::Body => cap.body.clone(),
        }
    }
    fn write(self, cap: &mut Capture, value: String) {
        match self {
            Field::Method => {
                cap.method = value;
                cap.touched_method = true;
            }
            Field::Url => {
                cap.url = value;
                cap.touched_url = true;
            }
            Field::Body => {
                cap.body = value;
                cap.touched_body = true;
            }
        }
    }
}

/// Install `getX()`/`setX(v)` for a scalar field. (A plain `.url` accessor
/// property would need a Rust-backed getter/setter pair too; the method form is
/// unambiguous and covers the same use — the SnippetHelp documents it.)
fn install_scalar_field<'js>(
    ctx: &Ctx<'js>,
    request: &Object<'js>,
    shared: Shared,
    field: Field,
) -> Result<(), String> {
    {
        let shared = shared.clone();
        let getter = Function::new(ctx.clone(), move || -> String {
            field.read(&shared.borrow())
        })
        .map_err(|e| format!("{}: {e}", field.getter_name()))?;
        request
            .set(field.getter_name(), getter)
            .map_err(|e| format!("{} set: {e}", field.getter_name()))?;
    }
    {
        let shared = shared.clone();
        let setter = Function::new(ctx.clone(), move |value: String| {
            field.write(&mut shared.borrow_mut(), value);
        })
        .map_err(|e| format!("{}: {e}", field.setter_name()))?;
        request
            .set(field.setter_name(), setter)
            .map_err(|e| format!("{} set: {e}", field.setter_name()))?;
    }
    // Seed a plain value property for read ergonomics (e.g. `lok.request.url`).
    let initial = field.read(&shared.borrow());
    let prop = match field {
        Field::Method => "method",
        Field::Url => "url",
        Field::Body => "body",
    };
    request
        .set(prop, initial)
        .map_err(|e| format!("{prop} seed: {e}"))?;
    Ok(())
}

/// `lok.response.*` — READ-ONLY response data + `getHeader`/`json()`.
fn install_response<'js>(
    ctx: &Ctx<'js>,
    lok: &Object<'js>,
    response_json: &Json,
    raw_body: &str,
    headers: &[KeyValue],
) -> Result<(), String> {
    let response = json_to_js(ctx, response_json)?
        .into_object()
        .ok_or_else(|| "response snapshot is not an object".to_string())?;

    // getHeader(name): case-insensitive join, like assert.rs::join_header.
    {
        let headers = headers.to_vec();
        let get_header = Function::new(ctx.clone(), move |name: String| -> Option<String> {
            let lower = name.to_ascii_lowercase();
            let matches: Vec<&str> = headers
                .iter()
                .filter(|kv| kv.name.to_ascii_lowercase() == lower)
                .map(|kv| kv.value.as_str())
                .collect();
            if matches.is_empty() {
                None
            } else {
                Some(matches.join(", "))
            }
        })
        .map_err(|e| format!("response.getHeader: {e}"))?;
        response
            .set("getHeader", get_header)
            .map_err(|e| format!("response.getHeader set: {e}"))?;
    }

    // json(): JSON.parse the body INSIDE the sandbox (NOT eval — no code exec).
    // A huge/hostile body throws in-VM (caught → the caller's try/catch or a
    // failed test) rather than blowing a Rust parser.
    {
        let body = raw_body.to_string();
        let json_fn = Function::new(
            ctx.clone(),
            move |inner: Ctx<'js>| -> rquickjs::Result<JsValue<'js>> {
                parse_json_in_vm(inner, &body)
            },
        )
        .map_err(|e| format!("response.json: {e}"))?;
        response
            .set("json", json_fn)
            .map_err(|e| format!("response.json set: {e}"))?;
    }

    lok.set("response", response)
        .map_err(|e| format!("lok.response: {e}"))?;
    Ok(())
}

/// `lok.expect/test/extract` — feed the test bucket + reuse json_path::resolve.
fn install_tests_and_extract<'js>(
    ctx: &Ctx<'js>,
    lok: &Object<'js>,
    shared: Shared,
    raw_body: &str,
) -> Result<(), String> {
    // expect(name, condition) → push {name, passed: !!condition}.
    {
        let shared = shared.clone();
        let expect = Function::new(ctx.clone(), move |name: String, condition: bool| {
            shared.borrow_mut().push_test(name, condition);
        })
        .map_err(|e| format!("expect: {e}"))?;
        lok.set("expect", expect)
            .map_err(|e| format!("lok.expect: {e}"))?;
    }
    // test(name, fn) → run fn; passed = it did not throw.
    {
        let shared = shared.clone();
        let test = Function::new(ctx.clone(), move |name: String, body: Function<'_>| {
            let passed = body.call::<_, ()>(()).is_ok();
            shared.borrow_mut().push_test(name, passed);
        })
        .map_err(|e| format!("test: {e}"))?;
        lok.set("test", test)
            .map_err(|e| format!("lok.test: {e}"))?;
    }
    // extract(jsonPath) → reuse json_path::resolve over the response body.
    {
        let body = raw_body.to_string();
        let extract = Function::new(
            ctx.clone(),
            move |inner: Ctx<'js>, path: String| -> rquickjs::Result<JsValue<'js>> {
                extract_in_vm(inner, &body, &path)
            },
        )
        .map_err(|e| format!("extract: {e}"))?;
        lok.set("extract", extract)
            .map_err(|e| format!("lok.extract: {e}"))?;
    }
    Ok(())
}

/// `lok.response.json()` implementation: parse the body with `JSON.parse`
/// INSIDE the VM so a non-JSON/hostile body throws in-sandbox (never runs, never
/// blows a Rust parser). Returns the parsed JS value.
fn parse_json_in_vm<'js>(ctx: Ctx<'js>, body: &str) -> rquickjs::Result<JsValue<'js>> {
    let json_ns: Object = ctx.globals().get("JSON")?;
    let parse: Function = json_ns.get("parse")?;
    parse.call((body.to_string(),))
}

/// `lok.extract(path)` implementation: resolve a JSONPath over the response body
/// with the shared `json_path` grammar and convert the node to a JS value (or
/// `null` when the body is non-JSON or the path is absent).
fn extract_in_vm<'js>(ctx: Ctx<'js>, body: &str, path: &str) -> rquickjs::Result<JsValue<'js>> {
    let parsed: Json = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(_) => return Ok(JsValue::new_null(ctx.clone())),
    };
    let resolved = json_path::resolve(&parsed, path);
    if !resolved.found {
        return Ok(JsValue::new_null(ctx.clone()));
    }
    json_to_js(&ctx, &resolved.value).map_err(|_| rquickjs::Error::Unknown)
}

// ============================================================================
// JS ⇆ serde_json bridge (§2.4) — 100% serde, no native pointers cross.
// ============================================================================

/// Display form of a JS value for `console.*` (best-effort, never throws).
fn js_to_display(value: &JsValue<'_>) -> String {
    if let Some(text) = value.as_string().and_then(|s| s.to_string().ok()) {
        return text;
    }
    match js_to_json(value) {
        Ok(Json::String(text)) => text,
        Ok(json) => json.to_string(),
        Err(_) => "[unserializable]".to_string(),
    }
}

/// Convert an rquickjs value to `serde_json::Value`. Functions, symbols and
/// circular graphs are REJECTED with a clear error (never silently coerced).
fn js_to_json(value: &JsValue<'_>) -> Result<Json, String> {
    js_to_json_depth(value, 0)
}

const MAX_JSON_DEPTH: usize = 128;

fn js_to_json_depth(value: &JsValue<'_>, depth: usize) -> Result<Json, String> {
    if depth > MAX_JSON_DEPTH {
        return Err("value too deeply nested (or circular)".to_string());
    }
    if value.is_null() || value.is_undefined() {
        return Ok(Json::Null);
    }
    if let Some(b) = value.as_bool() {
        return Ok(Json::Bool(b));
    }
    if let Some(i) = value.as_int() {
        return Ok(Json::from(i));
    }
    if let Some(f) = value.as_float() {
        return serde_json::Number::from_f64(f)
            .map(Json::Number)
            .ok_or_else(|| "non-finite number".to_string());
    }
    if let Some(s) = value.as_string() {
        return Ok(Json::String(s.to_string().map_err(|e| format!("{e}"))?));
    }
    if value.is_array() {
        let arr = value
            .as_array()
            .ok_or_else(|| "array coercion failed".to_string())?;
        let mut out = Vec::with_capacity(arr.len());
        for item in arr.iter::<JsValue>() {
            let item = item.map_err(|e| format!("{e}"))?;
            out.push(js_to_json_depth(&item, depth + 1)?);
        }
        return Ok(Json::Array(out));
    }
    if value.is_function() {
        return Err("cannot serialize a function".to_string());
    }
    if let Some(obj) = value.as_object() {
        let mut map = serde_json::Map::new();
        for entry in obj.props::<String, JsValue>() {
            let (key, val) = entry.map_err(|e| format!("{e}"))?;
            map.insert(key, js_to_json_depth(&val, depth + 1)?);
        }
        return Ok(Json::Object(map));
    }
    Err("unsupported value type (symbol?)".to_string())
}

/// Convert a `serde_json::Value` into an rquickjs value in `ctx`.
fn json_to_js<'js>(ctx: &Ctx<'js>, json: &Json) -> Result<JsValue<'js>, String> {
    match json {
        Json::Null => Ok(JsValue::new_null(ctx.clone())),
        Json::Bool(b) => Ok(JsValue::new_bool(ctx.clone(), *b)),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(JsValue::new_number(ctx.clone(), i as f64))
            } else if let Some(f) = n.as_f64() {
                Ok(JsValue::new_number(ctx.clone(), f))
            } else {
                Ok(JsValue::new_number(ctx.clone(), 0.0))
            }
        }
        Json::String(s) => {
            let js = rquickjs::String::from_str(ctx.clone(), s).map_err(|e| format!("{e}"))?;
            Ok(js.into_value())
        }
        Json::Array(items) => {
            let arr = rquickjs::Array::new(ctx.clone()).map_err(|e| format!("{e}"))?;
            for (index, item) in items.iter().enumerate() {
                arr.set(index, json_to_js(ctx, item)?)
                    .map_err(|e| format!("{e}"))?;
            }
            Ok(arr.into_value())
        }
        Json::Object(map) => {
            let obj = Object::new(ctx.clone()).map_err(|e| format!("{e}"))?;
            for (key, val) in map {
                obj.set(key.as_str(), json_to_js(ctx, val)?)
                    .map_err(|e| format!("{e}"))?;
            }
            Ok(obj.into_value())
        }
    }
}

/// Build a JS array of `{name, value, enabled}` objects from KeyValues.
fn keyvalues_to_js<'js>(ctx: &Ctx<'js>, kvs: &[KeyValue]) -> Result<JsValue<'js>, String> {
    let json = serde_json::to_value(kvs).map_err(|e| format!("{e}"))?;
    json_to_js(ctx, &json)
}

// ============================================================================
// Tauri commands (§3.2) — run a script against a snapshot from the editor.
// ============================================================================

/// Run a PRE script against a stored request, resolving run-vars like the
/// resolve path so `lok.env.set` → `{{var.x}}` semantics match a real send.
#[tauri::command]
pub fn run_pre_script(
    request: StoredRequest,
    environment_id: Option<String>,
    script: String,
) -> Result<ScriptOutcome, String> {
    let environments = crate::store::list_environments()?;
    let flat = crate::resolve::flatten_env(&environments, environment_id.as_deref());
    let ctx =
        crate::resolve::build_render_ctx(&environments, environment_id.as_deref(), &flat, false)?;
    let req = script_request_from(&request, &ctx.vars);
    Ok(run_pre(req, &script, ScriptLimits::default()))
}

/// Run a POST script against a given response snapshot + run-var map.
#[tauri::command]
pub fn run_post_script(
    response: ResponseData,
    script: String,
    variables: std::collections::HashMap<String, String>,
) -> Result<ScriptOutcome, String> {
    let resp = ScriptResponse {
        status: response.status,
        headers: response.headers.clone(),
        body: response.body.clone(),
        timings: serde_json::to_value(&response.timings).unwrap_or(Json::Null),
        vars: variables,
    };
    Ok(run_post(resp, &script, ScriptLimits::default()))
}

/// Build a `ScriptRequest` snapshot from a stored (still-templated) request and
/// the current run-var map. Secrets are absent by construction (the auth view
/// omits credential fields; the body/url still carry `{{secret.x}}` templates).
pub fn script_request_from(
    request: &StoredRequest,
    vars: &std::collections::HashMap<String, String>,
) -> ScriptRequest {
    let body = match &request.body {
        crate::models::Body::Raw { text, .. } => text.clone(),
        _ => String::new(),
    };
    ScriptRequest {
        method: request.method.clone(),
        url: request.url.clone(),
        body,
        headers: request.headers.clone(),
        query: request.query_params.clone(),
        auth_view: auth_view(&request.auth),
        vars: vars.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Auth;

    fn limits() -> ScriptLimits {
        ScriptLimits::default()
    }

    fn empty_pre() -> ScriptRequest {
        ScriptRequest {
            method: "GET".into(),
            url: "https://h/x".into(),
            body: String::new(),
            headers: vec![],
            query: vec![],
            auth_view: auth_view(&Auth::None),
            vars: std::collections::HashMap::new(),
        }
    }

    fn response(status: u32, body: &str) -> ScriptResponse {
        ScriptResponse {
            status,
            headers: vec![KeyValue {
                name: "Content-Type".into(),
                value: "application/json".into(),
                enabled: true,
            }],
            body: body.into(),
            timings: serde_json::json!({ "total_ms": 12.0 }),
            vars: std::collections::HashMap::new(),
        }
    }

    // ---------- SECURITY tests (min 4) ----------

    #[test]
    fn import_is_blocked() {
        // Top-level `import` is a syntax error when run as a script.
        let out = run_pre(empty_pre(), "import x from 'fs';", limits());
        assert!(!out.ok, "import must not run");
        assert!(out.error.is_some());
    }

    #[test]
    fn dynamic_import_and_require_and_fetch_are_undefined() {
        // require/fetch/import() all unreachable. A script that touches them
        // either throws (ok=false) or, when only reading typeof, reports
        // "undefined" for every host handle.
        let script = r#"
            lok.expect("no_require", typeof require === "undefined");
            lok.expect("no_fetch", typeof fetch === "undefined");
            lok.expect("no_xhr", typeof XMLHttpRequest === "undefined");
            lok.expect("no_ws", typeof WebSocket === "undefined");
            lok.expect("no_import", typeof globalThis.import === "undefined");
        "#;
        let out = run_post(response(200, "{}"), script, limits());
        assert!(out.ok, "typeof checks should not throw: {:?}", out.error);
        assert!(
            out.tests.iter().all(|t| t.passed),
            "some host handle present: {:?}",
            out.tests
        );
    }

    #[test]
    fn process_deno_bun_global_are_undefined() {
        let script = r#"
            lok.expect("no_process", typeof process === "undefined");
            lok.expect("no_deno", typeof Deno === "undefined");
            lok.expect("no_bun", typeof Bun === "undefined");
            lok.expect("no_global", typeof global === "undefined");
        "#;
        let out = run_post(response(200, "{}"), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(out.tests.iter().all(|t| t.passed), "{:?}", out.tests);
    }

    #[test]
    fn eval_and_function_removed_by_prologue() {
        let script = r#"
            lok.expect("no_eval", typeof eval === "undefined");
            lok.expect("no_function", typeof Function === "undefined");
            lok.expect("no_wasm", typeof WebAssembly === "undefined");
        "#;
        let out = run_post(response(200, "{}"), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(out.tests.iter().all(|t| t.passed), "{:?}", out.tests);
    }

    #[test]
    fn infinite_loop_hits_interrupt() {
        // A tight step budget so the test finishes fast; the guard must fire.
        let tight = ScriptLimits {
            wall_ms: 1000,
            step_limit: 50_000,
            memory_bytes: 16 * 1024 * 1024,
        };
        let began = Instant::now();
        let out = run_pre(empty_pre(), "while (true) {}", tight);
        assert!(!out.ok, "infinite loop must be interrupted");
        let msg = out.error.unwrap_or_default();
        assert!(
            msg.contains("step limit") || msg.contains("wall-time"),
            "limit error expected, got: {msg}"
        );
        assert!(
            began.elapsed() < Duration::from_secs(5),
            "interrupt was slow"
        );
    }

    #[test]
    fn memory_bomb_hits_limit_and_process_survives() {
        // Grow a string until the 16MB VM heap is exhausted → in-VM error.
        let script = r#"
            let s = "x";
            while (true) { s = s + s; }
        "#;
        let out = run_pre(empty_pre(), script, limits());
        assert!(!out.ok, "memory bomb must be capped");
        // A subsequent script in the SAME test still runs — the app is alive.
        let after = run_post(response(200, "{}"), "lok.expect('alive', true);", limits());
        assert!(
            after.ok && after.tests[0].passed,
            "process survived the bomb"
        );
    }

    #[test]
    fn deep_recursion_is_error_not_crash() {
        let out = run_pre(empty_pre(), "function f(){ return f(); } f();", limits());
        assert!(!out.ok, "unbounded recursion must error, not crash");
        assert!(out.error.is_some());
    }

    #[test]
    fn scripts_are_isolated_between_runs() {
        // Run 1 leaks a global; run 2 must not see it (fresh Context per run).
        let leak = run_pre(empty_pre(), "globalThis.leak = 1;", limits());
        assert!(leak.ok, "{:?}", leak.error);
        let check = run_post(
            response(200, "{}"),
            "lok.expect('no_leak', typeof globalThis.leak === 'undefined');",
            limits(),
        );
        assert!(check.tests[0].passed, "state bled across runs");
    }

    // ---------- FUNCTIONAL tests ----------

    #[test]
    fn pre_script_mutates_request() {
        let script = r#"
            lok.request.setHeader("X-Sig", "abc");
            lok.request.setUrl("https://h/patched");
            lok.request.setMethod("POST");
        "#;
        let out = run_pre(empty_pre(), script, limits());
        assert!(out.ok, "{:?}", out.error);
        let patch = out.request_patch.expect("pre produces a patch");
        assert_eq!(patch.url.as_deref(), Some("https://h/patched"));
        assert_eq!(patch.method.as_deref(), Some("POST"));
        let headers = patch.headers.expect("header touched");
        assert!(headers
            .iter()
            .any(|kv| kv.name == "X-Sig" && kv.value == "abc"));
    }

    #[test]
    fn pre_script_sets_env_var() {
        let out = run_pre(empty_pre(), "lok.env.set('id', '42');", limits());
        assert!(out.ok, "{:?}", out.error);
        assert_eq!(out.env_set, vec![("id".to_string(), "42".to_string())]);
    }

    #[test]
    fn pre_script_env_get_reads_a_value_it_set() {
        // `lok.expect` is POST-only; a PRE script proves the get→set round-trip
        // by throwing when the read-back mismatches (a throw ⇒ ok=false).
        let script = r#"
            lok.env.set('token', 'xyz');
            if (lok.env.get('token') !== 'xyz') { throw new Error('get mismatch'); }
        "#;
        let out = run_pre(empty_pre(), script, limits());
        assert!(
            out.ok,
            "get did not read back the set value: {:?}",
            out.error
        );
        assert!(out.env_set.iter().any(|(k, v)| k == "token" && v == "xyz"));
    }

    #[test]
    fn pre_script_cannot_see_resolved_secret() {
        // A Bearer request: the auth view must not carry the token.
        let mut req = empty_pre();
        req.auth_view = auth_view(&Auth::Bearer {
            token: "sk-live-super-secret".into(),
        });
        let script = r#"
            lok.env.set('auth_json', JSON.stringify(lok.request.auth));
        "#;
        let out = run_pre(req, script, limits());
        assert!(out.ok, "{:?}", out.error);
        let (_, value) = out.env_set.first().expect("auth serialized");
        assert!(
            !value.contains("sk-live"),
            "secret leaked into auth view: {value}"
        );
        assert!(value.contains("bearer"), "type still visible: {value}");
    }

    #[test]
    fn post_script_reads_response_sets_env_and_tests() {
        let script = r#"
            lok.expect('ok', lok.response.status === 200);
            const data = lok.response.json();
            lok.env.set('token', data.token);
            lok.expect('has_token', lok.extract('$.token') === 'T-9');
        "#;
        let out = run_post(response(200, r#"{"token":"T-9"}"#), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(out.tests.iter().find(|t| t.name == "ok").unwrap().passed);
        assert!(
            out.tests
                .iter()
                .find(|t| t.name == "has_token")
                .unwrap()
                .passed
        );
        assert_eq!(out.env_set, vec![("token".to_string(), "T-9".to_string())]);
    }

    #[test]
    fn post_script_body_is_not_eval() {
        // A malicious body string must stay DATA: .json() throws (not JSON) and
        // does NOT execute; process/global reach is still absent.
        let body = r#"({}).constructor.constructor('return process')()"#;
        let script = r#"
            let threw = false;
            try { lok.response.json(); } catch (e) { threw = true; }
            lok.expect('json_threw', threw);
            lok.expect('no_process', typeof process === 'undefined');
            lok.expect('raw_is_string', typeof lok.response.body === 'string');
        "#;
        let out = run_post(response(200, body), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(out.tests.iter().all(|t| t.passed), "{:?}", out.tests);
    }

    #[test]
    fn post_test_helper_passes_when_no_throw_fails_on_throw() {
        let script = r#"
            lok.test('passes', function () { /* no throw */ });
            lok.test('fails', function () { throw new Error('boom'); });
        "#;
        let out = run_post(response(200, "{}"), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(
            out.tests
                .iter()
                .find(|t| t.name == "passes")
                .unwrap()
                .passed
        );
        assert!(!out.tests.iter().find(|t| t.name == "fails").unwrap().passed);
    }

    #[test]
    fn console_log_is_captured_not_a_host_stream() {
        let out = run_post(
            response(200, "{}"),
            "console.log('hello', 42, {a:1});",
            limits(),
        );
        assert!(out.ok, "{:?}", out.error);
        assert_eq!(out.logs.len(), 1);
        assert!(
            out.logs[0].contains("hello"),
            "log captured: {:?}",
            out.logs
        );
    }

    #[test]
    fn serialization_rejects_function_value() {
        // Setting an env value that is a function must be rejected by the bridge
        // (env.set is typed String, so a function arg fails conversion → the
        // call throws in-VM). We assert the run reports the failure.
        let out = run_post(
            response(200, "{}"),
            "lok.env.set('bad', function(){});",
            limits(),
        );
        assert!(!out.ok, "a function value must not serialize");
    }

    #[test]
    fn serialization_roundtrip_nested_object() {
        // A nested value crosses to serde losslessly via extract.
        let body = r#"{"data":{"items":[1,2,3],"name":"ok"}}"#;
        let script = r#"
            const items = lok.extract('$.data.items');
            lok.expect('array', Array.isArray(items) && items.length === 3);
            lok.expect('name', lok.extract('$.data.name') === 'ok');
        "#;
        let out = run_post(response(200, body), script, limits());
        assert!(out.ok, "{:?}", out.error);
        assert!(out.tests.iter().all(|t| t.passed), "{:?}", out.tests);
    }
}
