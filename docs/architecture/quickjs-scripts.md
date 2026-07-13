# QuickJS Sandbox — Pre-/Post-Request Scripts (Ether)

Status: BLUEPRINT (design-only, no code in this doc).
Engine: **rquickjs** (QuickJS bindings). Language: English (Ether marka, i18n EN default).
Threat model anchor: Insomnia's 2025 template/script-injection CVE class — a "script" or
`{{...}}` template evaluated with host reach (fs / net / `require` / process env / template→code)
becomes arbitrary code execution against the user's machine. This design forbids that class of
reach **by construction**, not by allow-listing bad strings.

---

## 0. Why scripts, and the one-sentence security contract

Ether already has three *closed*, non-Turing-complete evaluators — `interp.rs` (`{{...}}`),
`assert.rs` (9 scriptless assertion types) and `workflow.rs` (Extract/Condition run-vars). Scripts
are the escape hatch users ask for: compute a signature, derive a nonce, reshape a payload, assert
on a decoded JWT. We add them **without widening the trust boundary**:

> A pre/post script is untrusted JS that runs inside a QuickJS Runtime with **no host bindings
> except one narrow, serde-validated bridge object (`lok`)**; it cannot reach the filesystem, the
> network, the process, real timers, other scripts, or Rust memory; it is hard-capped on wall time,
> instruction count and heap; and it never sees plaintext secrets.

Everything below is the mechanics of that sentence.

---

## 1. Sandbox (Rust — new module `src-tauri/src/scripts.rs`, dep `rquickjs`)

### 1.1 Placement in the crate

New module `scripts.rs`, sibling to `assert.rs`/`interp.rs`/`resolve.rs`, registered in `lib.rs`
(`mod scripts;`) and its two commands added to `generate_handler!`. New dependency in
`src-tauri/Cargo.toml`:

```
rquickjs = { version = "0.9", features = ["classes", "properties", "array-buffer"] }
```

Deliberately **not** enabled: `loader`, `dyn-load`, `futures`, `macro`-based module registration.
No `loader` = no ES-module resolver = `import` has nowhere to resolve to (see §1.3). QuickJS is a
pure interpreter with no ambient host: it ships **no** `fetch`, `XMLHttpRequest`, `require`,
`process`, `Deno`, `Bun`, `global.fs`, `WebAssembly.instantiateStreaming`, or `import()` unless the
embedder wires them. rquickjs wires **nothing** by default. Our job is therefore additive-only
(expose exactly `lok`) and we must be careful **not to opt into** dangerous helpers.

### 1.2 Runtime & Context construction (the isolation core)

```
Runtime::new()                              // fresh VM, its own heap, no shared globals
  .set_memory_limit(16 * 1024 * 1024)       // 16 MB hard cap — alloc past it => JS exception, unwinds
  .set_max_stack_size(256 * 1024)           // bound native+JS recursion (stack-overflow DoS)
  .set_interrupt_handler(Some(guard))       // see §1.4 — time + step budget
Context::full(&runtime)                     // base ECMAScript intrinsics ONLY
```

Key facts that make this safe:

- **A Runtime is a private VM.** No global is shared with the host or between two script runs. We
  build a fresh `Runtime` + `Context` **per invocation** (pre and post are separate runs) and drop
  it at the end — QuickJS has no persistent state, so run *N+1* cannot observe run *N*.
- `Context::full` gives base intrinsics (`JSON`, `Math`, `Array`, `String`, `Date`, `RegExp`,
  `Object`, `Promise`, `TypedArray`…). These are pure computation. It does **not** give any I/O.
- We never call `Runtime::set_loader(...)`, so the module machinery has no resolver/loader → dynamic
  `import()` and static `import` both fail at link time (see §1.3).

Everything the script touches from the outside world is the single `lok` global we inject in §2 —
and that object's methods are Rust closures that only ever move `serde_json::Value` in and out.

### 1.3 Exactly how each host escape is cut

| Escape vector | Why it's already absent / how we keep it absent |
|---|---|
| `import x from '...'` / `import('...')` | QuickJS resolves modules through a **loader**; with `loader`/`dyn-load` features off and `set_loader` never called, there is no resolver. We run scripts as a **script** (`Context::eval` with a non-module source, not `Module::evaluate`), so top-level `import` is a syntax error and dynamic `import()` rejects with "module loading disabled". No module can ever be pulled in. |
| `require('...')` | `require` is a Node CommonJS host function. QuickJS/rquickjs never define it. `require` is simply `undefined` → `TypeError: require is not a function`. |
| `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` | Browser/host APIs. Not part of ECMAScript, not injected by rquickjs, we do not add them. `fetch` is `undefined`. **Network is physically unreachable from JS** — the only way bytes leave the machine is the Rust engine (`engine.rs`), which the script cannot call. |
| `process` / `process.env` / `Deno` / `Bun` / `globalThis.require` | Node/Deno/Bun host globals. Never defined by QuickJS. All `undefined`. Env vars are unreachable; the *only* variables a script sees are the run-vars we hand it via `lok.env` (§2), which are Ether's own map, not `std::env`. |
| Filesystem (`fs`, `readFile`, `os`) | No such global exists in QuickJS. `lok` exposes zero fs surface. |
| Real timers (`setTimeout`/`setInterval`/`queueMicrotask` for busy-wait) | QuickJS has no event loop by itself; rquickjs only pumps a job queue if you enable `futures` (we don't) and call `run_pending_jobs`. We **do not** define `setTimeout`/`setInterval` → `undefined`. `Promise` exists but resolves synchronously within our drained microtask pump; a script cannot schedule real wall-clock work. This removes timer-based DoS and async exfil timing channels. |
| `eval` / `Function(...)` from *response body data* | This is the Insomnia CVE shape. Our mitigation is structural: **response body is delivered as a parsed `serde_json::Value` / string DATA object on `lok.response.body`, never `eval`'d, never concatenated into script source.** The script *source* is the user's own script text (authored in the editor, persisted with the request) — it is never assembled from server-controlled bytes. The engine's `interp.rs` also never treats a variable's value as code. `eval` itself technically exists in QuickJS, but it can only re-run *in-sandbox* JS (still no host reach), so it grants no new capability; we still **delete `eval` and `Function`** from the global (see §1.5) for defense-in-depth and to make "no dynamic code" auditable. |
| Reaching Rust memory / raw pointers | The bridge is **serde-only**: values cross the boundary as `serde_json::Value` (rquickjs `FromJs`/`IntoJs` via its serde integration), never as native pointers or `#[repr(C)]` structs. The script gets a plain JS object graph; Rust gets a `Value`. No `unsafe`, no handle leakage. |
| `globalThis` walk to something dangerous | After construction we **enumerate and prune** the global (see §1.5): everything is either a pure intrinsic we keep, or deleted. There is nothing dangerous on `globalThis` to walk to. |

### 1.4 Hard limits — interrupt handler (time **and** steps) + memory

Two independent DoS guards, both enforced by the runtime, not by trusting the script:

1. **Instruction/time interrupt.** `Runtime::set_interrupt_handler` installs a callback QuickJS
   invokes periodically between bytecode operations. Our handler holds:
   - `started: Instant`, `wall_limit: Duration` (default **1000 ms**);
   - `steps: AtomicU64`, `step_limit: u64` (default **5_000_000** interrupt ticks).
   The handler increments `steps`, and returns `true` (⇒ QuickJS **interrupts** execution, throwing
   an uncatchable `InterruptError` that unwinds to Rust) when *either* `steps > step_limit` **or**
   `started.elapsed() > wall_limit`. Because the interrupt is checked inside the bytecode loop,
   `while(true){}` is caught: it cannot starve the check. The step budget is the deterministic
   backstop for CI (wall clock is machine-dependent); the wall clock is the human-facing backstop.
   Both are configurable via a `ScriptLimits` struct with the defaults above.

2. **Memory limit.** `Runtime::set_memory_limit(16 MB)`. QuickJS tracks every allocation against
   this budget; an allocation that would exceed it fails, surfacing as a JS `RangeError`/out-of-
   memory that unwinds to Rust as an error. A `new Array(1e9)` / string-doubling "memory bomb" hits
   the ceiling and the run is reported as `error: script memory limit exceeded`, not an OOM-kill of
   the whole app.

3. **Stack limit.** `set_max_stack_size(256 KB)` bounds unbounded recursion (`function f(){f()}`)
   to a `RangeError` instead of a native stack overflow (which would be a hard crash / UB).

All three convert an adversarial script into a **clean, reported error** — the app process is never
killed and the Tauri command returns `Err(String)` / a `ScriptOutcome` with `error` set.

### 1.5 Global hardening (defense-in-depth, applied once per Context)

After creating the Context and before running user code, a fixed prologue (run as trusted
in-sandbox setup, not user text) prunes the global object to a known-good shape:

- Freeze the essential intrinsics we keep so the script can't monkey-patch `JSON`/`Object.prototype`
  to poison our result marshalling (`Object.freeze(JSON)` etc.), then
- Delete the dynamic-code and any accidentally-present host handles:
  `delete globalThis.eval; delete globalThis.Function;` and defensively
  `delete globalThis.WebAssembly; delete globalThis.SharedArrayBuffer;`
  (kills the two "compile bytes → code" and "shared-memory timing" surfaces).
- Do **not** expose `console` as a real console — instead define `console.log/info/warn/error` as
  Rust closures that push strings into a bounded capture buffer (§2.4), so logging is observable and
  cannot be used to reach a host stream.

This prologue is authored by us and stored as a `const &str` in `scripts.rs`; it is the *only*
privileged JS. It runs before the untrusted script and its effects (frozen intrinsics, deleted
globals, installed `lok`/`console`) are what the untrusted script inherits.

### 1.6 Result / error contract

`scripts.rs` exposes one internal entry point per phase, both total (never panic):

```
fn run_pre(req: ScriptRequest, script: &str, limits: ScriptLimits) -> ScriptOutcome
fn run_post(resp: ScriptResponse, ctx: PostCtx, script: &str, limits: ScriptLimits) -> ScriptOutcome
```

`ScriptOutcome` (serde, mirrored in `src/lib/scripts.ts`):

```
{
  ok: bool,                      // false when the script threw / hit a limit
  error: Option<String>,         // JS error message or "wall-time limit (1000ms) exceeded" etc.
  logs: Vec<String>,             // captured console.* lines, bounded (§2.4)
  request_patch: Option<...>,    // pre only: the mutated request fields to fold back (§2.1)
  env_set: Vec<(String,String)>, // run-vars the script set via lok.env.set (both phases)
  tests: Vec<ScriptTest>,        // post only: {name, passed} from lok.expect/lok.test (§2.2)
}
```

A thrown error or any limit hit sets `ok=false` and `error`; partial `logs`/`env_set` gathered
before the throw are still returned (useful for debugging). The pipeline treats `ok=false` as a
hard stop for the send when a *pre* script fails, and as a failed test bucket when a *post* script
fails (§3).

---

## 2. The `lok` bridge — the single, narrow JS→Rust surface

`lok` is the **only** non-intrinsic global. It is a frozen object whose leaf methods are Rust
closures. Nothing on it can read fs/net/process. All data crosses as `serde_json::Value`.

### 2.1 Pre-request: `lok.request` (mutate the PENDING request BEFORE interpolation)

The pre-script runs on the **stored, still-templated** request, *before* `build_render_ctx` and
interpolation (§3), so a script can set a run-var that a later `{{var.X}}` consumes, or rewrite the
URL/headers/body directly.

Shape handed in (a serde snapshot of the relevant `StoredRequest` fields — NOT the resolved spec,
so no secrets are present yet, see §5):

```
lok.request.method            // getter/setter: string
lok.request.url               // getter/setter: string (may still contain {{...}})
lok.request.getHeader(name)   // case-insensitive read
lok.request.setHeader(name, value)
lok.request.removeHeader(name)
lok.request.headers           // read-only array snapshot of {name,value}
lok.request.body              // getter/setter: string (raw body text; may contain {{...}})
lok.request.getQuery(name) / setQuery(name, value) / removeQuery(name)
lok.request.auth              // read-only view: {type, ...non-secret fields}  (see §5)
```

Mutations accumulate in a Rust-side `RequestPatch` (captured by the closures via `Rc<RefCell<…>>`
inside the Context, drained after the run). The patch is applied to the `StoredRequest` **before**
`resolve_spec`, so the normal escaping (`RenderTarget::Header`/`Url`/`JsonBody`) still runs over
whatever the script produced — the script cannot bypass CRLF/percent/JSON escaping. Auth is
**read-only** in v1 (a script may not inject a raw credential; it sets a run-var and the user
references it via `{{...}}` / a secret).

### 2.2 Post-response: `lok.response` (READ-ONLY data) + tests

The post-script runs **after** the engine returns `ResponseData`. The response is DATA, never code:

```
lok.response.status           // number (read-only)
lok.response.headers          // read-only array of {name, value}
lok.response.getHeader(name)  // case-insensitive join, like assert.rs::join_header
lok.response.body             // string (read-only) — the raw text body
lok.response.json()           // JSON.parse(body) INSIDE the sandbox → plain JS value, or throws
                              //   (this is JSON.parse, NOT eval — no code execution)
lok.response.timings          // {dns_ms, connect_ms, tls_ms, ttfb_ms, total_ms} (read-only)
```

Assertion helpers (feed back into the app's test results — complements `assert.rs`):

```
lok.expect(name: string, condition: boolean)   // push {name, passed: !!condition}
lok.test(name: string, fn: () => void)         // run fn; passed = it did not throw
lok.extract(jsonPath: string) -> value|null    // reuse json_path::resolve grammar over response body
```

`lok.expect`/`lok.test` append to the `tests: Vec<ScriptTest>` in `ScriptOutcome`. These are shown
alongside the scriptless `AssertOutcome`s in the Tests panel and folded into the same
pass/fail summary, so a request's verdict = (scriptless assertions) ∪ (script tests). `lok.extract`
reuses `json_path::resolve` so its grammar and coercion match `assert.rs`/`workflow.rs` exactly.

### 2.3 Shared: `lok.env` and `lok.variables` (run-vars, like `{{var.X}}`)

```
lok.env.get(name) -> string | null    // reads run-scoped vars (the workflow.rs `var.` namespace)
lok.env.set(name, value)              // sets a run-var → RenderCtx.vars for later {{var.name}}
lok.variables                         // read-only object view of the CURRENT run-var map
```

Semantics mirror `workflow.rs`: `env.set` in a **pre** script writes `RenderCtx.vars` *before*
interpolation, so `{{var.name}}` in the same request resolves to it. In a **post** script,
`env.set` writes run-vars that persist to the next workflow step (same lifetime as an `ExtractNode`
binding). `lok.env` is deliberately named after Postman/Insomnia's `pm.environment`/`insomnia.*` so
the mental model transfers, but it is **only** the run-var map — it can neither read process env nor
the plaintext secret store (§5).

### 2.4 Serialization JS↔Rust (serde_json, never native pointers)

- **In:** `ScriptRequest`/`ScriptResponse`/`PostCtx` are built in Rust from `StoredRequest` /
  `ResponseData` / the run-var map, serialized to `serde_json::Value`, and handed to the Context via
  rquickjs's serde `IntoJs`. The script sees a plain object graph.
- **Out:** every setter closure takes rquickjs JS values, converts to `serde_json::Value` via
  `FromJs`, and stores into the Rust-side patch/log/test/env buffers. `lok.response.json()` is
  implemented as an in-sandbox `JSON.parse` so a huge/hostile body throws inside JS (caught → test
  fail) rather than blowing a Rust parser.
- **Bounds:** the log buffer is capped (e.g. 256 lines × 4 KB, oldest dropped) so `console.log`
  in a loop cannot exhaust host memory *outside* the 16 MB VM budget. `env_set`/`tests` are likewise
  length-capped. Values that fail to convert (functions, symbols, circular graphs) are rejected with
  a clear error, not silently coerced.

No `#[repr(C)]`, no `*mut`, no `Box::into_raw` crosses the boundary. The bridge is 100% serde.

---

## 3. Pipeline integration (`resolve.rs` + new commands)

### 3.1 Where the two hooks sit in `resolve_and_send`

Current flow (see `resolve.rs::resolve_and_send`):

```
flatten_env → build_render_ctx → resolve_spec → engine::execute_request → ResponseData
```

New flow (both hooks are no-ops when the request carries no script — zero cost for existing
requests):

```
flatten_env
  → build_render_ctx (run-vars start empty)
  → [PRE] if request.pre_script: run_pre(request snapshot, ctx.vars) 
          → apply RequestPatch to the StoredRequest
          → merge env_set into ctx.vars           ← BEFORE interpolation, so {{var.x}} sees it
          → if !ok: ABORT the send (return Err with the script error)  ← fail-closed
  → resolve_spec (interpolates the possibly-patched request with the enriched ctx)
  → engine::execute_request → ResponseData
  → [POST] if request.post_script: run_post(response, ctx.vars)
          → merge env_set into the persisted run-vars (for workflows)
          → collect tests + logs
  → return an enriched result: { response, pre: ScriptOutcome?, post: ScriptOutcome? }
```

**Ordering is the security-relevant part:** the pre-script mutates the *templated* request and sets
run-vars **before** interpolation and **before** secrets are fetched, so (a) `{{var.x}}` set by the
script resolves normally, and (b) the pre-script never sees a resolved secret (§5). The post-script
reads the *response only* — it has no access to the outbound signed request or the credentials that
signed it.

`resolve_and_send`'s return type gains the optional script outcomes. `build_resolved_spec` (shared
with the WS transport) grows a variant that also runs the pre-script so subscriptions get parity, or
explicitly documents that subscriptions skip scripts in v1 — v1 choice: **HTTP only**, WS unchanged.

### 3.2 New Tauri commands (UI testing of a script in isolation)

Two `#[tauri::command]`s in `scripts.rs`, registered in `lib.rs`, so the editor can run a script
against a snapshot without sending a real request:

```
run_pre_script(request: StoredRequest, environment_id: Option<String>, script: String)
   -> ScriptOutcome            // resolves run-vars ctx like resolve does, runs pre, returns patch+logs+env

run_post_script(response: ResponseData, script: String, variables: HashMap<String,String>)
   -> ScriptOutcome            // runs post against a given/last response, returns tests+logs+env
```

The internal path (`resolve_and_send`) calls the same `run_pre`/`run_post` core functions, so the
"Run in editor" button and a real send share one implementation (no drift). FE wrappers land in
`src/lib/ipc.ts` (`runPreScript`, `runPostScript`) matching Rust param names exactly.

### 3.3 Persistence: `pre_script` / `post_script` on `StoredRequest` + migration

`models.rs::StoredRequest` gains two nullable fields (serde-defaulted so old JSON loads):

```
#[serde(default)] pub pre_script: Option<String>,
#[serde(default)] pub post_script: Option<String>,
```

`store.rs` migration — **additive, backward-compatible, bumps to v4** (following the exact v2
pattern that added `assertions_json`):

```
// v4: pre/post request scripts. Two additive nullable columns on `requests`.
// Old rows read NULL → None. `let _ =` swallows "duplicate column" so it is idempotent.
if version < 4 {
    let _ = conn.execute("ALTER TABLE requests ADD COLUMN pre_script TEXT", []);
    let _ = conn.execute("ALTER TABLE requests ADD COLUMN post_script TEXT", []);
    conn.execute("UPDATE schema_version SET version = 4", [])?;
}
```

`row_to_request` reads the two new columns (indices after `assertions_json`), `upsert_request` /
`list_requests` / `get_request` include them in their SELECT/INSERT column lists. A pre-v4 row (NULL
columns) round-trips to `pre_script: None, post_script: None`. Downgrade is safe: an older binary
ignores the extra columns. The `lok` CLI (`assert.rs` path) can optionally run scripts too, but v1
scope keeps the CLI on scriptless assertions and simply persists/loads the fields.

---

## 4. Frontend (React 19 + CodeMirror 6, tokens v2, i18n EN)

### 4.1 Editors — two new sub-tabs under the request workbench

Today `RequestTabs.tsx` has `Params | Headers | Body | Auth | Tests | cURL` and `TestsPanel`
renders scriptless assertions. We add script editing without disturbing that:

- Add a **`Scripts`** tab key to `RequestTabs.tsx` (chip count = number of non-empty scripts), OR
  keep `Tests` and add an internal two-segment control. v1 choice: a new top-level **`Scripts`** tab
  with an inner segmented control **`Pre-request` | `Tests`(post)**, leaving the existing scriptless
  `Tests` tab intact (scriptless assertions and script tests coexist and both feed the summary).
- New component tree under `src/components/workbench/scripts/`, one component per file
  (repo rule: 1 component = 1 file, logic in hooks):
  - `ScriptsPanel.tsx` — hosts the segmented control + the active editor + the results strip.
  - `ScriptEditor.tsx` — a CodeMirror JS editor. Reuse the `BodyEditor.tsx` pattern exactly:
    `@uiw/react-codemirror` + the shared `editorTheme` (tokens `--lok-bg-code`, `--lok-font-mono`),
    swapping `@codemirror/lang-json` for `@codemirror/lang-javascript` (new dep) with a
    non-blocking JS linter. `value`/`onChange` wire to `draft.pre_script`/`draft.post_script` via a
    `setPreScript`/`setPostScript` reducer action in `useRequestDraft.ts`.
  - `ScriptResults.tsx` — renders the last `ScriptOutcome`: a **console** section (the `logs` buffer,
    monospace, scrollable, `dvh` container per PWA rule) and a **tests** list (`{name, passed}`
    rows with pass/fail chips, styled like `AssertionList`), plus an `error` banner when `ok=false`.
  - `useScriptRunner.ts` — a hook that calls `runPreScript`/`runPostScript` (editor "Run" button)
    and holds the outcome; the real send path surfaces the same outcome from `resolveAndSend`.
  - `SnippetHelp.tsx` — a small popover / inline list of copy-paste snippets:
    `lok.env.set("token", ...)`, `lok.response.json()`, `lok.expect("2xx", lok.response.status < 300)`,
    `lok.extract("$.data.id")`, `lok.request.setHeader("X-Sig", ...)`. Documents the whole `lok`
    surface so users don't guess (and don't reach for a non-existent `require`/`fetch`).

### 4.2 Results plumbing

`useSendRequest.ts` already calls `resolveAndSend`; extend its return handling to store
`pre`/`post` outcomes on the response view-model and render them in `ScriptResults` and in the
response Tests summary. The post-script's `tests` merge with `evalAssertions` results for the unified
pass/fail count. `lok.env.set` values that came back are reflected in the active env indicator so a
user sees a run-var was written.

### 4.3 i18n (EN default)

New keys under a `scripts.*` namespace in `src/i18n/en.ts` (and `pl.ts`, since the app is bilingual
but **EN is default/marka**): `scripts.tabAria`, `scripts.preRequest`, `scripts.tests`,
`scripts.run`, `scripts.consoleHeading`, `scripts.testsHeading`, `scripts.error`,
`scripts.emptyHint` ("Optional JS. `lok.request` before send, `lok.response` after."),
`scripts.limitNote` ("Sandboxed: no network, filesystem or imports; 1s / 16MB budget."), plus one
key per snippet label. The CLI (`assert.rs`) stays i18n-free English literals, unchanged.

---

## 5. Security (the load-bearing section)

### 5.1 Attack vectors and how each is closed

| # | Vector | Closed by |
|---|---|---|
| A | **Sandbox escape → host code exec** (Insomnia CVE class) | No host bindings injected. `import`/`require`/`fetch`/`process`/`Deno`/fs are `undefined` (§1.3). The only bridge is `lok`, whose closures do serde-only data movement — no fs/net/process handle is reachable through it. `eval`/`Function` deleted (§1.5); even if present they only re-run in-sandbox JS with the same zero-capability global. |
| B | **Template/script injection from server data** | Response body is **DATA** on `lok.response.body` and via `JSON.parse` (`.json()`), never `eval`'d and never concatenated into script source. Script source = the user's authored text only. `interp.rs` never treats a value as code. So a malicious response cannot inject executable script. |
| C | **DoS: infinite loop** | Interrupt handler on **step count + wall time** (§1.4) fires inside the bytecode loop; `while(true){}` → clean `error: wall-time/step limit exceeded`, app unaffected. |
| D | **DoS: memory bomb** | `Runtime::set_memory_limit(16 MB)` → allocation past budget throws; reported as `error: memory limit exceeded`. Stack cap (256 KB) turns infinite recursion into a `RangeError`, not a native crash. Log/test/env buffers are length-capped so out-of-VM host memory can't be exhausted either. |
| E | **Secret exfiltration** | **Pre-script runs before secrets are fetched/interpolated** (§3.1): `build_render_ctx` fetches Keychain values *after* the pre hook, and the snapshot handed to `lok.request` contains only templated (`{{secret.x}}`) fields, never resolved values. Auth is read-only and its secret fields are **omitted** from `lok.request.auth`. The post-script sees only the *response*, never the outbound signed request or credentials. There is no `lok.secrets` API at all. Even if a script wanted to exfil, it has no network. |
| F | **Log/verbose leak** | Script `console.*` goes to the bounded capture buffer shown in-app, not to `engine.rs`'s verbose transfer log, and not to stdout/stderr. The existing `redact_verbose_line` / `REDACTED_HEADERS` machinery is untouched; scripts add no new sink. `ScriptOutcome.logs` are values the user chose to print (their own data), never auto-injected secrets. |
| G | **Cross-run / cross-request state bleed** | Fresh `Runtime`+`Context` per invocation, dropped after (§1.2). No shared global, no persisted VM. Run-vars are the only carry-over and they live in Ether's `RenderCtx.vars` (explicit, user-visible), not in JS globals. |
| H | **Prototype pollution poisoning our marshalling** | The trusted prologue `Object.freeze`es the intrinsics we rely on (`JSON`, `Object`) before user code runs (§1.5), and results cross via Rust serde `FromJs` (which reads own enumerable props / typed conversions), so a polluted `Object.prototype` can't smuggle a field into a `RequestPatch`. |
| I | **Interrupt/limit bypass via async** | No real timers, no futures feature, microtasks drained under the same interrupt/limit budget (§1.3 timers row). A `Promise` chain can't outlive the wall/step budget or schedule host work. |
| J | **Panic → app crash / poisoned mutex** | `run_pre`/`run_post` are total: every rquickjs error path maps to `ScriptOutcome{ok:false,error}`; no `.unwrap()` on script results; the store mutex is never held across a script run (scripts touch no DB). |

### 5.2 Security test plan (all MUST be blocked / handled — Rust unit tests in `scripts.rs`)

Every one of these is a `#[test]` asserting the sandbox neutralizes the input:

- `import_is_blocked` — a script with `import x from 'fs'` → `ok=false`, error mentions module/import; nothing imported.
- `require_is_undefined` — `require('fs')` → `TypeError` captured as `ok=false`; no fs access.
- `fetch_and_xhr_absent` — `typeof fetch`, `typeof XMLHttpRequest`, `typeof WebSocket` all `"undefined"` (assert via a script that `lok.expect`s each, or returns them).
- `process_and_deno_absent` — `typeof process`, `typeof Deno`, `typeof Bun`, `typeof global` → `"undefined"`.
- `eval_and_function_removed` — `typeof eval === "undefined"` and `typeof Function === "undefined"` after the prologue.
- `infinite_loop_hits_interrupt` — `while(true){}` returns `ok=false` with a time/step-limit error, and the test itself completes well under a generous timeout (proves the interrupt fires).
- `memory_bomb_hits_limit` — a growing-string / `new Array(1e9).fill(0)` loop → `ok=false` with a memory-limit error; process still alive (subsequent script in the same test runs fine).
- `deep_recursion_is_range_error_not_crash` — `function f(){return f()} f()` → `ok=false` `RangeError`, no native stack overflow.
- `no_fs_no_net` — assert there is no reachable API to open a file or socket (typeof checks on every known host handle; `lok` has no such method).
- `pre_script_mutates_request` — `lok.request.setHeader('X-Sig','abc'); lok.request.url = 'https://h/x'` → the resulting `RequestPatch` shows the header + URL; **and** after `resolve_spec` the header value is still Header-escaped (CRLF injection through the script is rejected by the existing `RenderTarget::Header` guard).
- `pre_script_sets_var_before_interpolation` — pre sets `lok.env.set('id','42')`; request URL `https://h/{{var.id}}` resolves to `.../42` (proves ordering: env.set → interpolation).
- `pre_script_cannot_see_resolved_secret` — env declares a secret; the `lok.request.auth` view for a Bearer/`{{secret.x}}` request contains no plaintext secret value (only the template / omitted).
- `post_script_reads_response_sets_env_and_tests` — post does `lok.expect('ok', lok.response.status===200)`, `lok.env.set('token', lok.response.json().token)`, `lok.extract('$.token')`; outcome has one passing test, one `env_set`, correct extract value.
- `post_script_body_is_not_eval` — a response body of `"({}).constructor.constructor('return process')()"` on `lok.response.body` is a plain string; `.json()` on it throws (not JSON) and does not execute; `process` still unreachable.
- `serialization_roundtrip` — a nested object/array set via `lok.env.set`/returned crosses to `serde_json::Value` losslessly; functions/symbols/circular are rejected with a clear error.
- `scripts_are_isolated_between_runs` — a script that sets `globalThis.leak=1` does not affect a second run's `typeof globalThis.leak` (fresh Context).

### 5.3 Store & FE tests

- **store (round-trip + migration):** `pre_post_script_round_trip` (upsert with both scripts → list/get returns them, incl. `None` when absent); `migrate_v3_to_v4_adds_script_columns_and_preserves_rows` (seed a v3 DB with a request, run `migrate`, assert version=4, `pre_script`/`post_script` columns exist, the pre-existing row survives with `None` scripts); `migrate_is_idempotent` extended to v4.
- **FE (Vitest + React Testing Library, mock `invoke`):** `ScriptEditor` renders and calls `onChange`; `ScriptsPanel` segmented control switches Pre/Tests; `ScriptResults` renders `logs`, a passing and a failing test row, and the `error` banner when `ok=false`; `useScriptRunner` calls `runPreScript`/`runPostScript` (mocked `invoke`) and stores the outcome; snippet-help lists the `lok` surface.

---

## 6. Deliverables checklist (for the implementing PRs)

- **Cargo:** add `rquickjs` (features: `classes`, `properties`, `array-buffer`; NOT `loader`/`futures`).
- **Rust:** `src-tauri/src/scripts.rs` (sandbox core, `lok` bridge, `run_pre`/`run_post`, two commands, security tests); `mod scripts;` + two entries in `lib.rs::generate_handler!`.
- **models.rs:** `pre_script`/`post_script: Option<String>` on `StoredRequest` (serde-default); `ScriptOutcome`/`ScriptTest`/`ScriptLimits` types.
- **store.rs:** v4 migration (2 additive columns) + SELECT/INSERT/`row_to_request` updates + round-trip/migration tests.
- **resolve.rs:** wire PRE (before `build_render_ctx` secret fetch / before `resolve_spec`) and POST (after `execute_request`) into `resolve_and_send`; enrich its return type; fail-closed on pre error.
- **FE:** `src/components/workbench/scripts/{ScriptsPanel,ScriptEditor,ScriptResults,SnippetHelp}.tsx` + `useScriptRunner.ts`; `Scripts` tab in `RequestTabs.tsx`; `pre_script`/`post_script` in `useRequestDraft.ts` + `src/lib/types.ts`; `runPreScript`/`runPostScript` in `src/lib/ipc.ts` + `src/lib/scripts.ts` outcome types; `scripts.*` i18n in `en.ts`/`pl.ts`; add `@codemirror/lang-javascript`.
- **docs:** this file, plus a `docs/lambdas`-style note is N/A (desktop app) — update `docs/architecture/testing.md` cross-link so scriptless assertions + script tests are described as one verdict.

---

## 7. Non-goals (v1)

- No network/fs/timer APIs inside scripts — ever (that is the whole security posture).
- No `lok.secrets` read API; no writing raw credentials from a script (set a run-var + `{{...}}`).
- No script on WebSocket/GraphQL-subscription transport (HTTP send only).
- No shared/persistent JS VM, no cross-request globals, no npm/module ecosystem.
- No CLI script execution in v1 (the `lok` CLI persists the fields but runs scriptless assertions).
