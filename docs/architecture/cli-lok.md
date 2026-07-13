# `lok` — Headless CLI Runner — Architecture Blueprint

> **Ether**'s CI companion: a single, dependency-light binary (`lok`) that runs
> saved requests, collections, and workflows against **real** endpoints from a
> terminal or a CI job — no GUI, no Tauri window, no mocks. It evaluates the same
> scriptless assertions the desktop app shows, and exits non-zero when any
> assertion fails, so an API contract becomes a `cargo build && lok run …` gate.
>
> This is a **blueprint, not code.** It fixes the bin target, the Tauri-free
> execution path, the CLI surface (clap), the Rust assertion port, the three
> reporters (JUnit / JSON / HTML), a GitHub Action template, and an offline test
> plan — so implementation builds against one shared design.
>
> `lok` **reuses, never rebuilds**: the `lokowka_lib` engine (`engine.rs`),
> the resolve pipeline (`resolve.rs`), the store (`store.rs`), interpolation
> (`interp.rs`), SigV4 (`sigv4.rs`), the JSONPath port (`json_path.rs`), and the
> workflow executor (`workflow.rs`). It adds exactly **one** dependency: `clap`.

---

## 0. What already exists (reuse, do not rebuild)

| Asset | Where | How `lok` reuses it |
|---|---|---|
| `engine::run(spec) -> Result<ResponseData, String>` (private, **synchronous**, no Tauri) | `engine.rs:384` | The real transfer. `engine::execute_request` is only a `#[tauri::command] async` wrapper around `spawn_blocking(run)`. `lok` calls a thin **public** `engine::execute_sync(spec)` that forwards to `run` — **zero async runtime needed** for a single request. |
| `resolve::build_resolved_spec(request, env_id) -> RequestSpec` (**already a plain `pub fn`, not a command**) | `resolve.rs:41` | This is the Tauri-free resolve entry point the prompt asks for. It calls `store::list_environments` + `flatten_env` + `build_render_ctx` + `resolve_spec`. `lok` calls it directly; SigV4 folds in for free. |
| `resolve::resolve_spec` / `flatten_env` / `build_render_ctx` (all `pub fn`) | `resolve.rs` | Used by `build_resolved_spec`; also reusable if `lok` needs to inject `var.*` (workflow parity). |
| `store::list_requests` / `list_collections` / `list_environments` / `workflow_list` / `get_request` | `store.rs` | These are `#[tauri::command]` **but take no `AppHandle`** — they read the process-global `CONNECTION` `OnceLock`. Once the DB is initialised (see §1.A), `lok` calls them as ordinary functions. `get_request(id)` is already `pub(crate)`; promote to `pub` for the bin. |
| `store::init_in_memory()` (exists, `#[cfg(test)] pub(crate)`) | `store.rs:62` | Proof the store can init **without** an `AppHandle`. `lok` needs the same shape but non-test and file-backed: add `store::init_path(path)` (§1.A). |
| `json_path::resolve(root, path)` + `value_matches_expected(node, expected)` (both `pub`) | `json_path.rs` | The Rust JSONPath port already used by `workflow.rs`. The assertion port (§2) reuses it verbatim for `json_path_*` — identical grammar to the FE `resolveJsonPath`, so a CLI pass ⇒ a GUI pass. |
| `workflow::run_graph` / `live_runner` / `validate_graph` | `workflow.rs` | `lok run <workflow-id>` reuses the executor. The traversal core `run_graph` takes an **injectable runner** and an `EventSink` trait, so `lok` supplies a headless `Emit` (collects events instead of `app.emit`) — no Tauri needed. |
| `models::{StoredRequest, RequestSpec, ResponseData, Collection, Workflow, Assertion, …}` | `models.rs` | The whole data model. `Assertion` (9 variants, `#[serde(tag="type")]`) is what `lok` evaluates. `StoredRequest.assertions: Vec<Assertion>` travels with each request. |
| `secrets::secret_get` / `sigv4::*` | `secrets.rs`, `sigv4.rs` | Reached transitively through `build_resolved_spec`; secrets from the Keychain, SigV4 from `~/.aws`. On a headless Linux CI runner the Keychain is absent — see §6 (secrets in CI). |

**Non-negotiable constraints carried from the codebase:**

- **Marka = Ether.** Binary is `lok`; user-facing product name is **Ether**. Data
  dir namespace is `com.bryndalski.ether`; env override is `ETHER_DATA_DIR` (legacy
  alias `LOKOWKA_DATA_DIR` still honoured — see `engine.rs:292`). DB file is
  `ether.db`.
- **No new heavy deps.** Only `clap` is added. Reporters are hand-rolled pure
  string builders (no `quick-xml`, no `askama`) — the output shapes are small and
  stable, and a template engine would be a new dependency for no benefit.
- **Secrets never printed.** `lok` output paths reuse the store's redaction
  contract; a resolved token/secret must never reach stdout, a report file, or the
  verbose log (engine already redacts `Authorization`/`Cookie`/`X-Api-Key` in the
  verbose log — `engine.rs:135`).
- **Real endpoints only.** No mock transport. The offline test plan (§5) spins a
  loopback `std::net::TcpListener`, exactly as `resolve.rs`/`workflow.rs` tests do.

---

## 1. Bin target & the Tauri-free execution path

### `Cargo.toml` change (additive, one bin + one dep)

```toml
# src-tauri/Cargo.toml — add under existing [lib]/[dependencies]

[[bin]]
name = "lok"
path = "src/bin/lok.rs"

[dependencies]
# ...existing...
clap = { version = "4", features = ["derive"] }
```

`[lib] crate-type` already includes `"rlib"`, so `src/bin/lok.rs` can
`use lokowka_lib::{engine, resolve, store, models, workflow, interp, sigv4};`
The existing `[[bin]]`-less desktop entry (`src/main.rs` → `lokowka_lib::run()`)
is untouched; `lok` is a **second** binary in the same crate. Building only the
CLI: `cargo build --bin lok` (does not link the Tauri window path at all, because
`main.rs`'s Tauri runtime is only pulled in when *that* bin is built).

> **Why `clap` is allowed:** the prompt explicitly permits it, and it is the
> lowest-friction, best-documented arg parser. `derive` keeps the command tree
> declarative and colocated with the structs.

### 1.A — Store init without `AppHandle` (the core Tauri problem)

`store::init(app: &AppHandle)` resolves `app.path().app_data_dir()` — unavailable
without a running Tauri app. `store::init_in_memory()` proves the connection can be
built without Tauri, but it is `#[cfg(test)] pub(crate)` and RAM-only.

**Fix — add one public, file-backed initializer** that mirrors `init` but takes an
explicit path (refactor the shared body out of `init`):

```rust
// store.rs (new public fn; init() and init_path() share open_and_migrate())

/// Open (or create) the store at an explicit path and run migrations. Tauri-free
/// entry point for the `lok` CLI. Idempotent-ish: a second call errors like init()
/// ("store already initialised"), so the CLI calls it exactly once at startup.
pub fn init_path(db_path: &std::path::Path) -> Result<(), String> {
    if let Some(dir) = db_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create db dir: {e}"))?;
    }
    let conn = Connection::open(db_path).map_err(sql_err)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(sql_err)?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(sql_err)?;
    migrate(&conn)?;
    CONNECTION.set(Mutex::new(conn)).map_err(|_| "store already initialised".to_string())
}
```

**DB path resolution order** the CLI uses (highest precedence first):

1. `--db <path>` flag (explicit)
2. `$ETHER_DATA_DIR/ether.db` (legacy `$LOKOWKA_DATA_DIR` honoured — reuse the exact
   lookup in `engine::data_dir()`, so the CLI and the engine's cookie-jar/cookie
   paths agree on one namespace)
3. Default desktop location: `~/Library/Application Support/com.bryndalski.ether/ether.db`
   (so `lok` reads the **same DB the GUI writes** — the whole point of a headless
   runner: run the requests you authored in the app)

`lok` calls `store::init_path(&resolved)` once in `main()`, before any command runs.

### 1.B — Executing a request without a Tauri async runtime

`engine::execute_request` is `async` + `#[tauri::command]` and internally does
`tauri::async_runtime::spawn_blocking(|| run(spec)).await`. The `run(spec)` it wraps
is a **plain synchronous fn** (`engine.rs:384`) that does the whole libcurl transfer
and writes history. For a single request the CLI does **not** need any runtime.

**Fix — expose the sync core:**

```rust
// engine.rs — thin public wrapper (run() stays private)

/// Synchronous request execution for non-Tauri callers (the `lok` CLI). Same
/// transfer + history-write as the async command, minus the spawn_blocking hop.
pub fn execute_sync(spec: RequestSpec) -> Result<ResponseData, String> {
    run(spec)
}
```

**The exact CLI request path (no Tauri, no async):**

```
lok run <request-id>
   │
   ├─ store::init_path(db)                         // §1.A
   ├─ let stored = find_request(<id>)              // store::get_request / list_requests
   ├─ let spec  = resolve::build_resolved_spec(&stored, env_id)?   // resolve.rs:41 — plain fn
   ├─ let started = Instant::now()
   ├─ let response = engine::execute_sync(spec)?   // §1.B — sync libcurl
   ├─ let results  = assert::eval_assertions(&response, &stored.assertions)  // §2
   └─ collect into RunResult { request, response, results }
```

**Workflows are the one place a runtime is needed.** `workflow::run_graph` is
`async` (it awaits the engine per node and uses `tokio::select!` for Delay/stop).
For `lok run <workflow-id>` the CLI builds a **single-threaded tokio runtime** and
`block_on`s the traversal — the crate already depends on `tokio` (`sync`, `time`,
`macros`); the bin adds `rt` (single-thread) to the CLI's tokio feature set:

```rust
// in lok.rs, workflow branch only:
let rt = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
let events = rt.block_on(run_workflow_headless(&workflow, env_id));  // §4
```

> `new_current_thread` (not multi-thread) matters: `engine::run` is sync/blocking
> and is reached from the workflow's `live_runner` via `spawn_blocking` inside the
> async command path. On a current-thread runtime `lok` instead uses a headless
> runner that calls `engine::execute_sync` directly (no `spawn_blocking`), so there
> is no nested-runtime hazard. See §4.

### Decision summary — how `lok` sidesteps Tauri

| Tauri coupling | Blocker | `lok`'s resolution |
|---|---|---|
| `store::init(&AppHandle)` needs `app_data_dir()` | No app handle in CLI | New `store::init_path(path)` (shared body with `init`); path from `--db`/`ETHER_DATA_DIR`/default |
| `engine::execute_request` is `async #[tauri::command]` | Command + runtime | New `engine::execute_sync(spec)` → private sync `run(spec)`; **no runtime for single requests** |
| `resolve::resolve_and_send` is `async #[tauri::command]` | Command + runtime | **Skip it.** Use the already-plain `resolve::build_resolved_spec` + `engine::execute_sync` (its non-command twin) |
| `workflow::workflow_run(app, …)` emits over `app.emit` | Needs AppHandle + async | Reuse `run_graph` with a headless `Emit` impl + a **current-thread tokio runtime** built by the CLI |
| `store::get_request` visibility | `pub(crate)` | Promote to `pub` (already command-adjacent; no behaviour change) |

Net Rust surface added to `lokowka_lib`: `store::init_path`, `engine::execute_sync`,
`store::get_request` → `pub`, and a new `assert` module (§2). No existing signature
changes; the desktop app is unaffected.

---

## 2. Rust assertion port (`assert.rs`)

The FE evaluates assertions in TS (`src/lib/assertions.ts`, `evalAssertions`). The
CLI runs headless in Rust, so the **9 assertion types** are ported to a new
`src-tauri/src/assert.rs`, reusing `json_path::resolve` + `value_matches_expected`
(already the Rust twin of the TS JSONPath) so a CLI result is byte-for-byte the
GUI's verdict.

### The 9 types (1:1 with `models::Assertion` and the TS union)

| `Assertion` variant | Semantics (mirror `assertions.ts`) | Reuses |
|---|---|---|
| `StatusEquals { expected }` | `response.status == expected` | — |
| `StatusInRange { min, max }` | `min <= status <= max` | — |
| `HeaderExists { name }` | case-insensitive header present | `join_header` (port of `joinHeader`) |
| `HeaderEquals { name, expected }` | present **and** joined value `== expected` | `join_header` |
| `JsonPathExists { path }` | body parses as JSON, path `found` | `json_path::resolve` |
| `JsonPathEquals { path, expected }` | found **and** `value_matches_expected` | `json_path::{resolve, value_matches_expected}` |
| `JsonPathType { path, expected_type }` | found **and** `json_type(node) == expected_type` | `json_path::resolve` + a small `json_type()` (port of `jsonType`) |
| `BodyContains { substring }` | `response.body.contains(substring)` | — |
| `ResponseTimeBelow { max_ms }` | `response.timings.total_ms < max_ms` | — |

### Result contract (mirrors `AssertionResult`/`AssertionStatus`)

```rust
// assert.rs
pub enum AssertStatus { Pass, Fail, Skipped }

pub struct AssertOutcome {
    pub index: usize,
    pub status: AssertStatus,
    pub label: String,       // human line, e.g. "status == 200"
    pub message: String,     // "status 200 == 200" | "expected 200, got 404"
    pub expected: Option<String>,
    pub actual: Option<String>,
}

/// Total & side-effect-free: a malformed assertion or a non-JSON body yields a
/// Fail with a diagnostic — never a panic (same guarantee as evalAssertions).
/// disabled (`enabled == false`) → Skipped. Body parsed at most once, shared
/// across all json_path_* checks (mirrors evalAssertions' parse cache).
pub fn eval_assertions(response: &ResponseData, assertions: &[Assertion]) -> Vec<AssertOutcome>;

pub struct AssertSummary { pub total, passed, failed, skipped: usize, pub all_passed: bool }
pub fn summarize(outcomes: &[AssertOutcome]) -> AssertSummary;
```

**Key parity notes** (so Rust matches TS exactly):

- **Binary body guard:** `json_path_*` and `body_contains` **fail** (not panic)
  when `response.body_is_base64` — same as `bodyIsBinary` in the TS.
- **Lenient equality:** `json_path_equals` delegates to `value_matches_expected`
  (`"200"↔200`, `"true"↔true`), already the shared rule.
- **Localisation:** the TS messages are i18n keys; the CLI is English-only (a
  headless tool). Messages are plain English literals — no i18n dependency pulled
  into the bin.
- **No i18n / no `translate`:** `assert.rs` must NOT import the FE's TS strings;
  it produces its own compact English messages. (Ether marka: CLI is English.)

`eval_assertions` is the **single core the tests drive** (§5) — it needs no network,
no store, no Tauri; it's a pure function over a `ResponseData` + `&[Assertion]`.

---

## 3. CLI surface (clap, derive)

```
lok — Ether headless API runner

USAGE:
  lok run <TARGET> [--env <NAME>] [--db <PATH>] [--reporter <FMT>] [--out <PATH>]
  lok run --file <exported.json> [--env <NAME>] [--reporter <FMT>] [--out <PATH>]
  lok list [requests|collections|workflows] [--db <PATH>]

GLOBAL:
  --db <PATH>          Path to ether.db (default: $ETHER_DATA_DIR or app-support)
  -q, --quiet          Suppress the human summary (reporter file still written)
  -v, --verbose        Print per-assertion lines to stderr

run:
  <TARGET>             A request id, collection id, OR workflow id (auto-detected)
  --file <PATH>        Run an exported request/collection JSON instead of the DB
  --env <NAME>         Environment by NAME (resolved to its id via list_environments)
  --reporter <FMT>     junit | json | html   (default: none — human summary only)
  --out <PATH>         Write the report here (default: stdout for the chosen FMT)
```

### `lok run <TARGET>` — target resolution

`<TARGET>` is one positional id, disambiguated by lookup order (a UUID is unique
across tables, so at most one matches):

1. `store::get_request(id)` → **single request** run.
2. else `list_collections()` contains id → **collection** run: `list_requests(Some(id))`,
   run each in `sort_order`, aggregate.
3. else `workflow_list()` contains id → **workflow** run (§4).
4. else → error `unknown target id: <id>` (exit 2 — usage/lookup error, distinct
   from an assertion failure exit, see §3.1).

`--file <exported.json>` (optional, prompt-flagged as such): parse an exported
`StoredRequest` or `{collections, requests}` bundle (same shape `importers.rs`
produces) with `serde_json`, run it **without** touching the DB. Useful for CI that
checks a request definition committed to the repo, not a local DB.

### `lok list <what>`

`requests` → id · method · name (+ collection); `collections` → id · name;
`workflows` → id · name · node-count. Plain columns to stdout; `--reporter json`
also supported for scripting (`lok list requests --reporter json`).

### 3.1 — Exit codes (the CI contract)

| Code | Meaning |
|---|---|
| `0` | Every executed request completed **and every enabled assertion passed** (all-green). A request with **zero** assertions passes iff the transfer succeeded (2xx-agnostic: no assertions ⇒ "did it run"). |
| `1` | Ran, but **≥1 assertion failed** (or a workflow node failed). The report enumerates which. This is the "tests red" signal CI keys on. |
| `2` | Usage / lookup / config error (unknown id, bad `--reporter`, DB init failure, malformed `--file`). |
| `3` | Transport error on a request with no assertions (curl failure / DNS / timeout) — distinct from a logical assertion failure so CI can tell "endpoint down" from "contract broke". |

`all_passed` across every request/assertion in the run ⇒ exit 0; else the first
non-zero class above. Exit code is computed from the aggregated `RunReport` (§3.2),
independent of `--reporter` (a report is a *record*; the exit code is the *gate*).

### 3.2 — The aggregate result the whole tool centres on

```rust
// One structure every reporter formats and the exit code derives from.
pub struct RunReport {
    pub target: RunTarget,          // Request(id) | Collection(id) | Workflow(id) | File(path)
    pub started_at: String,         // rfc3339
    pub cases: Vec<RunCase>,        // one per executed request (or workflow node)
    pub summary: RunSummary,        // totals across cases + assertions
}
pub struct RunCase {
    pub request_id: String,
    pub name: String,
    pub method: String,
    pub url: String,                // effective_url (post-redirect), NEVER carrying a secret query value
    pub status: u32,
    pub total_ms: f64,
    pub transport_error: Option<String>,
    pub assertions: Vec<AssertOutcome>,   // §2
}
pub struct RunSummary {
    pub cases: usize, pub cases_failed: usize,
    pub assertions_total: usize, pub assertions_passed: usize,
    pub assertions_failed: usize, pub assertions_skipped: usize,
    pub all_green: bool, pub duration_ms: f64,
}
```

`RunReport` is the **only** thing reporters see — they are pure
`fn(&RunReport) -> String`. The runner (network + assertions) and the reporters
(formatting) never mix.

---

## 4. Workflows headless (`lok run <workflow-id>`)

Reuse `workflow::run_graph` unchanged. It already abstracts two seams for exactly
this: an injectable **request runner** and an **`Emit`** trait for events.

- **Headless `Emit`:** a `struct CollectEmit(Arc<Mutex<Vec<WorkflowEvent>>>)` that
  pushes events into a Vec instead of `app.emit(CHANNEL, …)` — same pattern as the
  test-only `RecordingEmit` in `workflow.rs`. `lok` reads the collected events to
  build a `RunReport` (one `RunCase` per `Request`/`Condition`/`Extract` node from
  `Succeeded`/`Failed`/`Extracted` events).
- **Headless runner:** a runner that resolves each node's `StoredRequest`
  (`stored_request_for` — promote to `pub` or expose a `pub fn prepare_spec`) and
  calls `engine::execute_sync` inside the async closure (no `spawn_blocking`, so a
  `current_thread` runtime is safe). Structurally identical to `live_runner`, minus
  the Tauri-command engine call.
- **Runtime:** the CLI builds `tokio::runtime::Builder::new_current_thread()` and
  `block_on(run_graph(...))`. A `watch::channel(false)` supplies the never-signalled
  stop receiver `run_graph` requires.
- **Exit code:** a `Failed` event ⇒ exit 1; workflows don't carry per-request
  assertions in v1 (assertions live on `StoredRequest`, and a workflow node's
  request *does* carry them — v1 evaluates them per request node and folds the
  outcomes into the `RunReport`, so a workflow gates on assertions too).

> This keeps `lok`'s workflow path a **thin headless adapter** over the exact
> executor the desktop app ships — no second traversal engine.

---

## 5. Reporters (pure `fn(&RunReport) -> String`)

All three live in `src-tauri/src/report.rs`, no template/xml crate — hand-rolled,
XML/HTML-escaped, deterministic ordering (case order = run order; assertion order =
list order). Each is unit-tested by **parsing its own output back** (§6).

### 5.1 — JUnit XML (`--reporter junit`)

CI-native (GitHub, GitLab, Jenkins, Buildkite all ingest JUnit). Mapping:

- One `<testsuite>` per `RunTarget` (name = target id/name), `tests`/`failures`/
  `skipped`/`time` from `RunSummary`.
- One `<testcase>` **per assertion** (`classname` = request name, `name` =
  assertion label, `time` = request `total_ms`/1000). A failed assertion emits a
  child `<failure message="expected X, got Y">…</failure>`; skipped → `<skipped/>`.
- A **transport error** (request that never got a response) emits one `<testcase>`
  with an `<error>` child.
- All attribute values XML-escaped (`& < > " '`). Secrets already redacted upstream;
  URLs use `effective_url` with secret query params masked.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="3" failures="1" skipped="0" time="0.412">
  <testsuite name="collection: Smoke" tests="3" failures="1" time="0.412">
    <testcase classname="GET /health" name="status == 200" time="0.101"/>
    <testcase classname="GET /users" name="$.data type array" time="0.180">
      <failure message="expected type array, got object"/>
    </testcase>
    <testcase classname="GET /users" name="response time < 500ms" time="0.180"/>
  </testsuite>
</testsuites>
```

### 5.2 — JSON (`--reporter json`)

The `RunReport` serialized with `serde_json::to_string_pretty` — machine-readable,
stable field names (§3.2). This is the format other tools (dashboards, `jq`) parse;
its test asserts a round-trip (`serde_json::from_str::<RunReport>` back).

### 5.3 — HTML (`--reporter html`)

A single self-contained `.html` (inline CSS, no assets, no JS required) — a human
opens the artifact in CI and reads it. Layout: a summary banner (green/red, totals,
duration), then a table per case: method + URL + status + timing, and a nested list
of assertions (✔/✖/–, message, expected/actual on failure). Brand: Ether wordmark,
Duotio-adjacent indigo accent (`#4f46e5`) for pass, red for fail. Everything HTML-
escaped. Its test asserts the string contains the case names, the summary counts,
and no unescaped `<script>` from response data.

> `--reporter` with no `--out` writes the formatted report to **stdout** (so
> `lok run x --reporter junit > results.xml` works); `--out <path>` writes the file
> and keeps the human summary on stdout unless `--quiet`.

---

## 6. Test plan (cargo, offline, no AWS, no network egress)

All tests are offline: they bind a loopback `std::net::TcpListener` (the exact
pattern in `resolve.rs:815` and `workflow.rs:650`) and hit `127.0.0.1`. No mock
transport — the engine really speaks HTTP to a local one-shot server.

### 6.A — `assert.rs` unit tests (pure, no network)

The bulk of coverage, since `eval_assertions` is a pure function:

- **status_equals** pass/fail; **status_in_range** in/out; **header_exists** and
  **header_equals** case-insensitive + multi-value join; **json_path_exists/equals/
  type** on a fixture body incl. lenient coercion (`"200"↔200`); **body_contains**;
  **response_time_below** using a synthetic `Timings`.
- **Guards:** binary body ⇒ `json_path_*`/`body_contains` **Fail**, not panic;
  disabled assertion ⇒ **Skipped**; malformed JSON body ⇒ `json_path_*` Fail with a
  diagnostic. `summarize` totals + `all_passed`.
- **Parity fixtures:** a shared JSON body + assertion set asserted to produce the
  same verdicts the TS `evalAssertions` would (documented expected outcomes; the
  json_path core is already the shared `json_path.rs` tested in that module).

### 6.B — CLI runner e2e via the runner core (no process spawn required)

Drive the **runner-core function** (`fn run_request_target(id, env, db) -> RunReport`)
against a loopback server, per the prompt ("test through the core runner fn"):

1. **`status == 200` ⇒ exit 0.** Init a temp file DB (`store::init_path(tempdir)`),
   `upsert_collection`+`upsert_request` a request pointing at the loopback URL with
   one `StatusEquals { 200 }`; server replies 200; assert `RunReport.summary.all_green`
   and the derived exit code `== 0`.
2. **assertion fail ⇒ exit ≠ 0.** Same, but server replies 404 (or assert `== 200`
   while serving 500); assert `all_green == false` and exit class `1`.
3. **env interpolation in the CLI.** Persist an `Environment { host = 127.0.0.1:PORT }`,
   store a request `http://{{env.host}}/health`, run with `--env <name>`; assert the
   loopback server saw `GET /health` and the run is green. (Proves `build_resolved_spec`
   threads env vars through the CLI path exactly like the app — mirrors the ignored
   `resolve_and_send_hits_local_server_with_env_host` test, but through `lok`'s path.)
4. **transport error ⇒ exit 3.** Point a no-assertion request at a closed port;
   assert `transport_error.is_some()` and exit class `3`.

> **Store-connection caveat (carried from `resolve.rs`/`store.rs` tests):** the
> store is a **process-global `OnceLock`**. Existing `store::tests` wipe every table
> in `setup()`, which races any other in-process test that seeded data. The CLI
> e2e tests either (a) run each with a **file-backed temp DB via `init_path`** and a
> shared serialising mutex (own lock, like `store::tests::TEST_LOCK`), so they don't
> collide with the in-memory `store::tests`, or (b) live in a separate integration
> test binary (`src-tauri/tests/lok_e2e.rs`) with its **own** `init_path(tempfile)`
> — the cleaner option, since an integration test binary gets a fresh process and a
> fresh `OnceLock`, sidestepping the shared-connection race entirely.

### 6.C — Reporter tests (parse the output back)

- **JUnit:** feed a `RunReport` with 1 pass + 1 fail + 1 skip; parse the XML (a
  tiny hand-check or `roxmltree` **only in `[dev-dependencies]`**, never the bin)
  and assert `tests=3 failures=1 skipped=1`, a `<failure>` under the failing case,
  and that a `"a<b&c"` name is escaped to `a&lt;b&amp;c`.
- **JSON:** `serde_json::from_str::<RunReport>(&json_report(&r)).unwrap()` round-trips
  and equals the input (`PartialEq` on `RunReport`).
- **HTML:** output contains each case name + the summary counts; a response body
  containing `<script>alert(1)</script>` appears **escaped** (`&lt;script&gt;`).

### 6.D — `list` and `--file`

- `lok list requests/collections/workflows` against a seeded temp DB returns the
  expected ids (drive `list_*` through `init_path` + a serialising lock or the
  integration-test binary).
- `--file` parses an exported `StoredRequest` JSON and runs it with **no DB**
  (init skipped), assertions still evaluated.

### 6.E — assert_cmd (optional, if trivial)

A single smoke test via `assert_cmd` (`[dev-dependencies]`) that builds `lok` and
runs `lok run <id> --db <tempdb> --reporter json`, asserting the process **exit
code** and that stdout parses as a `RunReport`. Kept optional — the core-fn tests
above already cover behaviour; the process test only verifies the wiring in
`main()` (arg parse → exit code). Skip if it slows CI meaningfully.

**Gate before commit (worktree, local — CI is billing-blocked):**
`npm ci` · `npm run typecheck` · `npm run test:unit` ·
`cd src-tauri && cargo test` · `cargo clippy --all-targets -- -D warnings`.
(No TS changes in this doc-only PR, but the gate runs the full suite regardless.)

---

## 7. GitHub Action (`.github/workflows/api-tests.yml` — CI template)

> Real CI for this account is **billing-blocked** — this is a **usage template**,
> committed as documentation of the intended pipeline, not an active workflow the
> user pays to run. Placed alongside the existing `ci.yml`/`release.yml`.

```yaml
# .github/workflows/api-tests.yml
name: API Tests (lok)

on:
  workflow_dispatch:      # manual — billing-safe; flip to push/schedule when enabled
  # push: { branches: [main] }
  # schedule: [{ cron: "0 6 * * *" }]   # nightly contract check

jobs:
  api-tests:
    name: lok run — API contract
    runs-on: macos-14     # libcurl + keyring native path matches the dev/build target
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: src-tauri }

      - name: Build lok
        run: cargo build --release --bin lok
        working-directory: src-tauri

      - name: Run API tests
        env:
          ETHER_DATA_DIR: ${{ github.workspace }}/.ether-ci   # isolated DB dir
          # Secrets referenced by {{secret.*}} come from GH secrets, NOT the Keychain
          # (headless CI has no Keychain). See §6 note — inject via env or a --file bundle.
          API_TOKEN: ${{ secrets.API_TOKEN }}
        run: |
          ./src-tauri/target/release/lok run smoke-collection \
            --env ci \
            --reporter junit --out results.xml
        # exit 0 = all green; 1 = assertion failed; 2/3 = config/transport (job fails on any non-zero)

      - name: Publish test report
        if: always()
        uses: mikepenz/action-junit-report@v4
        with: { report_paths: results.xml }

      - name: Upload HTML report
        if: always()
        run: ./src-tauri/target/release/lok run smoke-collection --env ci --reporter html --out report.html
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: lok-report, path: report.html }
```

### Composite action (`.github/actions/lok/action.yml`)

Optional reusable wrapper so other repos/jobs call `lok` in one line:

```yaml
# .github/actions/lok/action.yml
name: "Run lok"
description: "Build and run the Ether lok API-test CLI, emit a JUnit report"
inputs:
  target:   { description: "request/collection/workflow id", required: true }
  env:      { description: "environment name", required: false }
  reporter: { description: "junit|json|html", required: false, default: "junit" }
  out:      { description: "report output path", required: false, default: "results.xml" }
runs:
  using: "composite"
  steps:
    - shell: bash
      run: cargo build --release --bin lok --manifest-path src-tauri/Cargo.toml
    - shell: bash
      run: |
        ./src-tauri/target/release/lok run "${{ inputs.target }}" \
          ${{ inputs.env && format('--env {0}', inputs.env) || '' }} \
          --reporter "${{ inputs.reporter }}" --out "${{ inputs.out }}"
```

**CI secrets caveat (headless has no Keychain):** on macOS/Linux CI the
`keyring` backend that `secrets::secret_get` reads is unavailable, so
`{{secret.*}}` resolution would fail. Two supported CI patterns, documented for
the implementer: (a) reference secrets as **env vars** through a CI environment
whose `{{env.*}}` values come from `${{ secrets.* }}` (no Keychain needed); or
(b) ship a `--file` bundle that carries no secrets and inject the token via an
`Authorization` header env var. **v1 recommendation:** CI uses `{{env.*}}` +
GitHub secrets → env; the Keychain path stays desktop-only.

---

## 8. Implementation order (for the follow-up build PR)

1. `store::init_path` + promote `store::get_request` to `pub` (+ unit: init a
   temp-file DB, round-trip a request).
2. `engine::execute_sync` (trivial wrapper; covered by the existing engine tests +
   a new sync smoke against loopback).
3. `assert.rs` — the 9-type port + `summarize` (the pure core; heaviest test file).
4. `report.rs` — JUnit / JSON / HTML pure formatters + round-trip tests.
5. `bin/lok.rs` — clap tree, target resolution, runner core, exit-code mapping.
6. Workflow headless adapter (`CollectEmit` + current-thread runtime).
7. `tests/lok_e2e.rs` integration binary (own `init_path` → no OnceLock race).
8. `.github/workflows/api-tests.yml` + `.github/actions/lok/action.yml` (template).

Each step is independently testable and additive; nothing changes an existing
signature or the desktop app's behaviour.
```
