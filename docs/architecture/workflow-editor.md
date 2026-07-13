# Visual Workflow Editor — Architecture Blueprint

> **Ether**'s flagship feature: chain saved requests into a visual graph, extract
> values from one response into the next, branch on conditions, and watch the run
> light up node-by-node on the canvas — all against **real** endpoints, no mocks.
>
> This is a **blueprint, not code.** It fixes the data contract, the Rust
> executor, the React Flow canvas, and the test plan so parallel work streams
> build against one shared design. It reuses — never rebuilds — three existing
> subsystems: the `resolve.rs` resolve+send pipeline, the `subscriptions.rs`
> registry+emit streaming pattern, and the `store.rs` migration + `*_json`
> persistence convention.

---

## 0. What already exists (reuse, do not rebuild)

| Asset | Where | How the workflow feature reuses it |
|---|---|---|
| `resolve_and_send` / `build_resolved_spec` / `resolve_spec(request, ctx, redact)` | `src-tauri/src/resolve.rs` | Each `RequestNode` runs through **`resolve_spec`** with an augmented `RenderCtx`, then `engine::execute_request`. Interpolation, auth folding, SigV4, history-write-by-engine all come for free. |
| `RenderCtx { env, secrets }` + `interp::render(target)` | `src-tauri/src/interp.rs` | Run-scoped variables are injected as **extra `env` entries** on the `RenderCtx` (see §2.3). No new interpolation grammar — `{{var.NAME}}` maps to an existing namespace. |
| `flatten_env` / `build_render_ctx` | `src-tauri/src/resolve.rs` | The executor calls these ONCE per run to build the base ctx, then clones + augments it per `RequestNode`. |
| Registry + `StopHandle` (watch + `JoinHandle`) + `EventSink` + `app.emit(CHANNEL, &event)` | `src-tauri/src/subscriptions.rs` | The workflow **run registry** and the `"workflow-run"` event channel are a direct structural copy: id-keyed `HashMap<String, StopHandle>`, graceful `watch` stop + hard-abort backstop, monotonic `seq` on every emit. |
| `useSubscription` (one global `listen`, route-by-id, capped buffer, cleanup) | `src/hooks/useSubscription.ts` | `useWorkflowRun` is the same shape: one `listen("workflow-run")`, route events by `run_id`, map `node_id → status`. |
| `store.rs` migration (`schema_version`), `snapshots`/`gql_schema_cache` CRUD, `*_json` columns, `new_id` | `src-tauri/src/store.rs` | The `workflows` table + `workflow_list/upsert/delete` are modeled 1:1 on the `snapshots` CRUD and the v2 additive migration. |
| `resolveJsonPath(root, path)` (dot/bracket JSONPath: `$`, `$.a.b`, `$.items[2].id`) | `src/lib/assertions.ts` | `ExtractNode` and `ConditionNode` **JSONPath evaluation on the Rust side** uses the *same grammar*; a tiny Rust port (`json_path.rs`) mirrors it so extraction is deterministic and identical to what the FE assertions already do. |
| `@xyflow/react` `^12.11.2` | `package.json` (already installed) | The canvas. No new dependency. |
| i18n `en.ts` (source of truth) + `pl.ts` (`typeof en`) + `useT()` | `src/i18n/*` | Every visible string is an `en`+`pl` key. `typeof en` makes a missing `pl` key a **typecheck failure**. Zero Polish visible under EN. |

**Non-negotiable constraints carried from the codebase:**
- Interpolation/secrets/auth/SigV4 happen **only in Rust** (`resolve.rs`), never on the FE.
- One component = one file; logic in hooks; types at module scope; `100dvh`, no window scroll.
- `prefers-reduced-motion` is a hard gate (collapse animation to opacity swaps).
- **A workflow run makes REAL network requests** — the UI must warn loudly before a run.

---

## 1. Data model — `models.rs` (additive only) + store migration

### 1.1 New shared types (append to `src-tauri/src/models.rs`)

We touch `models.rs` **only by appending** — no existing struct changes (that
rule is documented at the top of `models.rs`). `StoredRequest`, `RequestSpec`,
`Environment`, `ResponseData` are all reused verbatim.

```rust
// ---------- workflow graph (SQLite: `workflows` table, graph_json) ----------

/// A saved workflow graph: an addressable set of nodes + directed edges. The
/// whole graph serializes to `workflows.graph_json` as ONE blob (matches the
/// `snapshots.baseline_json` convention — the graph is edited/saved atomically,
/// never queried by sub-field, so a single JSON column is correct here).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub nodes: Vec<WorkflowNode>,
    #[serde(default)]
    pub edges: Vec<WorkflowEdge>,
}

/// Canvas coordinates for a node (React Flow's `position`). Kept on every node
/// variant so the graph round-trips through the store without a side table.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

/// One node in the graph. Internally tagged on `"kind"` (same convention as
/// `Body`/`Auth`/`Assertion`) so the TS mirror stays a 1:1 discriminated union.
/// Every variant carries `id` (graph-unique, distinct from any StoredRequest id)
/// and `position`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkflowNode {
    /// Execute a request. Either references an existing StoredRequest by id, or
    /// carries an inline one (so a workflow is self-contained / exportable).
    Request {
        id: String,
        #[serde(flatten)]
        source: RequestSource,
        position: NodePosition,
    },
    /// Pull a JSONPath value out of the PREVIOUS request node's response and bind
    /// it to a run-scoped variable named `var_name`. Referenced downstream as
    /// `{{var.var_name}}`.
    Extract {
        id: String,
        /// JSONPath into the last response body (same grammar as `resolveJsonPath`).
        source: String,
        var_name: String,
        position: NodePosition,
    },
    /// Branch. Evaluates a small predicate against the last response; the run
    /// then follows the outgoing edge whose `branch` matches the boolean result.
    Condition {
        id: String,
        expr: ConditionExpr,
        position: NodePosition,
    },
    /// Pause the run for `ms` milliseconds (bounded, see §2.5).
    Delay {
        id: String,
        ms: u64,
        position: NodePosition,
    },
}

/// A request node's payload: a reference to a saved request, or an inline copy.
/// Untagged so the JSON is `{ "request_ref": "id" }` XOR `{ "request": {...} }`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RequestSource {
    RequestRef(String),      // id of an existing StoredRequest
    Request(StoredRequest),  // inline, self-contained
}

/// A tiny, NON-Turing-complete condition. Deliberately closed (same philosophy as
/// interp.rs / Assertion) — never an eval()/expression engine. v1 covers the two
/// cases the prompt calls out: `status == N` and a JSONPath exists/equals check.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConditionExpr {
    /// True when the last response status equals `expected`.
    StatusEquals { expected: u16 },
    /// True when the last response status is in [min, max].
    StatusInRange { min: u16, max: u16 },
    /// True when a JSONPath resolves to a present node (a present `null` counts).
    JsonPathExists { path: String },
    /// True when the JSONPath node string-matches `expected` (lenient coercion,
    /// same rule as `valueMatchesExpected` in assertions.ts: "200"↔200, "true"↔true).
    JsonPathEquals { path: String, expected: String },
}

/// A directed edge. `branch` is Some(true)/Some(false) ONLY on edges leaving a
/// ConditionNode (the true/false arms); None for every ordinary sequential edge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowEdge {
    pub from: String, // node id
    pub to: String,   // node id
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<bool>,
}
```

**Why these shapes**
- `WorkflowNode` is tagged on `"kind"` and `ConditionExpr`/`RequestSource` reuse
  the exact serde conventions already in `models.rs` → the TS mirror in
  `src/lib/workflow.ts` is a mechanical union (see §3.1), no bespoke (de)serializer.
- The **entire graph is one `graph_json` blob** (not normalized into node/edge
  tables) — it is authored + saved atomically and never queried by sub-field.
  This is exactly the `snapshots.baseline_json` decision, so we stay consistent.
- `RequestSource` gives both worlds: a node **references** a saved request (edits
  to that request flow into the workflow) *or* holds an **inline** copy (a
  workflow is exportable / self-contained). The executor resolves refs at run
  time (§2.2).

### 1.2 Store migration (`store.rs` → `migrate`)

Additive, versioned exactly like the v2 assertions migration:

```rust
// v3: visual workflows. New standalone table; no change to existing tables, so a
// downgrade just ignores it (backward-compatible). Idempotent CREATE IF NOT EXISTS.
if version < 3 {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workflows (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             graph_json TEXT NOT NULL,
             created_at TEXT NOT NULL
         );",
    ).map_err(sql_err)?;
    conn.execute("UPDATE schema_version SET version = 3", []).map_err(sql_err)?;
}
```

`graph_json` holds `{ nodes, edges }` (the `Workflow` without `id`/`name`, or the
whole `Workflow` — see the row helper below). Backward compatibility: an old DB
opened by a new binary runs the `v3` step once; a new DB opened by an old binary
never reads the table. `snapshots`/`requests` are untouched, so a workflow that
references a request id keeps working even though there is **no FK** — a dangling
ref is handled at run time (§2.2) rather than by a cascade (a workflow should
survive a request being renamed/deleted, surfacing a clear "request not found").

### 1.3 Store commands (`store.rs`, modeled on the snapshot CRUD)

```rust
// ---------- workflows (visual graph) ----------

fn row_to_workflow(row: &Row) -> rusqlite::Result<Workflow> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let graph_json: String = row.get(2)?;
    // graph_json holds { nodes, edges }; id/name come from their own columns.
    let graph: WorkflowGraph = serde_json::from_str(&graph_json).unwrap_or_default();
    Ok(Workflow { id, name, nodes: graph.nodes, edges: graph.edges })
}

#[tauri::command]
pub fn workflow_list() -> Result<Vec<Workflow>, String> { /* SELECT … ORDER BY name */ }

#[tauri::command]
pub fn workflow_upsert(workflow: Workflow) -> Result<Workflow, String> {
    let mut stored = workflow;
    stored.id = new_id(&stored.id);              // reuse the existing helper
    let created_at = chrono::Utc::now().to_rfc3339();
    let graph_json = serde_json::to_string(
        &WorkflowGraph { nodes: stored.nodes.clone(), edges: stored.edges.clone() }
    ).map_err(json_err)?;
    // INSERT … ON CONFLICT(id) DO UPDATE SET name=…, graph_json=… (created_at kept)
    Ok(stored)
}

#[tauri::command]
pub fn workflow_delete(id: String) -> Result<(), String> { /* DELETE FROM workflows … */ }
```

`WorkflowGraph { nodes, edges }` is a tiny private helper struct so the blob is
`{nodes, edges}` while `id`/`name`/`created_at` live in their own columns (keeps
list/rename cheap and mirrors how `snapshots` splits `request_id` out of the blob).

Register all three in `lib.rs` `generate_handler!` and add typed wrappers to
`src/lib/ipc.ts`:

```ts
export function workflowList(): Promise<Workflow[]> { return invoke("workflow_list"); }
export function workflowUpsert(workflow: Workflow): Promise<Workflow> { return invoke("workflow_upsert", { workflow }); }
export function workflowDelete(id: string): Promise<void> { return invoke("workflow_delete", { id }); }
```

---

## 2. Executor — new module `src-tauri/src/workflow.rs`

### 2.1 Module shape & commands

```rust
//! Sequential workflow executor. Walks a saved graph from its start node along
//! edges, running each node in turn against REAL endpoints, threading a run-scoped
//! variable map (from ExtractNode) into every downstream RequestNode's
//! interpolation context. Streams per-node progress to the FE over "workflow-run".
//!
//! Reuse: resolve::resolve_spec + engine::execute_request for RequestNode;
//! interp::RenderCtx for run-vars; a subscriptions.rs-style registry + EventSink.

const CHANNEL: &str = "workflow-run";
const MAX_STEPS: usize = 200;                             // hard loop guard (§2.5)
const MAX_RUN: Duration = Duration::from_secs(300);       // wall-clock cap (§2.5)

#[tauri::command]
pub async fn workflow_run(
    app: AppHandle,
    workflow: Workflow,
    environment_id: Option<String>,
) -> Result<String, String>          // returns run_id immediately; run continues in a task

#[tauri::command]
pub async fn workflow_stop(run_id: String) -> Result<bool, String>  // graceful watch + abort
```

`workflow_run` validates the graph (exactly one start node — see §2.2; every edge
endpoint exists), mints a `run_id` (uuid), builds the `EventSink`, spawns the run
task, registers a `StopHandle`, and returns the id — **the identical pattern to
`subscription_start`**.

### 2.2 Graph traversal (sequential, cursor-based)

- **Start node** = the node with **no incoming edge** (in-degree 0). If there are
  zero or more than one, fail the run up front with a clear `failed` event
  (`"workflow has no unique start node"`) — v1 is a single linear/branching path,
  not a DAG scheduler.
- Maintain a `cursor: &str` (current node id) and a `last_response: Option<ResponseData>`.
- Loop, incrementing `steps`:
  1. `steps += 1`; if `steps > MAX_STEPS` → emit `failed{message:"step limit exceeded (200)"}`, stop. If `start.elapsed() > MAX_RUN` → `failed{message:"time limit exceeded (300s)"}`, stop.
  2. Look up the node by `cursor`; emit `started{node_id}`.
  3. Execute it (§2.4). On error → emit `failed{node_id, message}`, stop the run.
  4. Pick the next edge (§2.4 for Condition; otherwise the single outgoing edge
     with `branch == None`). No outgoing edge → run finished → emit a terminal
     `log{message:"run complete"}` + a `complete`-style status; stop.
  5. `cursor = edge.to`.
- **Cancellation**: `tokio::select!` the step against the `watch` stop receiver
  every iteration (mirrors `run_ws`'s stop handling); a graceful stop emits a
  final `log{message:"stopped"}` and deregisters.

The traversal is **sequential and single-cursor** — no fan-out, no parallel
branches — which is what "idzie po grafie SEKWENCYJNIE" requires and keeps the
step/time guards meaningful.

### 2.3 Run-scoped variables → interpolation (THE key decision)

**How run-vars reach `resolve`:** the executor keeps a
`run_vars: HashMap<String, String>`. Before running a `RequestNode` it builds a
`RenderCtx` and **merges `run_vars` under a `var.` prefix into `ctx.env`**, then
calls the existing `resolve_spec`:

```rust
// Built ONCE per run from the environment (reusing resolve.rs):
let environments = store::list_environments()?;
let flat = resolve::flatten_env(&environments, environment_id.as_deref());
let base_ctx = resolve::build_render_ctx(&environments, environment_id.as_deref(), &flat, false)?;

// Per RequestNode — clone the base ctx and layer run-vars on top:
let mut ctx = base_ctx.clone();
for (name, value) in &run_vars {
    ctx.env.insert(format!("var.{name}"), value.clone());  // {{var.NAME}} → run value
}
let spec = resolve::resolve_spec(&stored_request, &ctx, false)?;   // existing fn, unchanged
let response = engine::execute_request(spec).await?;
```

`interp::render` already resolves `{{env.X}}` by looking up the literal key
`"env.X"`… **no** — it looks up namespaced tokens. To make `{{var.NAME}}` work we
add **one** run-var namespace to the interpolator, the minimal, closed change:

- In `interp.rs` `resolve_token`, alongside the existing `env.`/`secret.`/`$…`
  arms, add a `var.` arm that reads from a new `RenderCtx.vars: HashMap<String,String>`.
- `RenderCtx` gains one field: `pub vars: HashMap<String, String>` (defaulted
  empty via `#[derive(Default)]`, already present) — a **purely additive** change,
  every existing `RenderCtx { env, secrets }` construction keeps compiling because
  the executor is the only site that fills `vars`, and the struct literal sites in
  resolve.rs/tests get `..Default::default()` or the new field set to `HashMap::new()`.

> **Decision:** run-vars are a **first-class `var.` namespace on `RenderCtx`**, NOT
> smuggled into `env`. Rationale: (a) it cannot collide with a user's env var of
> the same name, (b) `{{var.token}}` reads self-documenting in the UI, (c) it
> keeps the "one closed interpolation grammar" invariant from `interp.rs` intact
> — we add exactly one namespace, no expression engine. `resolve_spec` itself is
> **unchanged**; only `RenderCtx` grew a field. This is the smallest possible
> touch to the resolve pipeline.

### 2.4 Per-node execution

| Node | Behavior | Emits |
|---|---|---|
| **RequestNode** | Resolve the referenced/inline `StoredRequest` via §2.3, `engine::execute_request`. Store as `last_response`. A `request_ref` that no longer exists → `failed{message:"request not found: <id>"}`. | `started`, then `succeeded{data: {status, timings, size}}` or `failed{message}` |
| **ExtractNode** | Run `json_path::resolve(&last_response.body_as_json, &source)`. Found → `run_vars.insert(var_name, stringified)`. Not found → `failed{message:"extract: path not found: <path>"}` (a workflow that depends on a missing value should stop, not silently continue). | `extracted{data: {var_name, value}}` |
| **ConditionNode** | Evaluate `ConditionExpr` against `last_response` (status or JSONPath, using the ported evaluator). Result `bool` selects the outgoing edge whose `branch == Some(result)`. No matching branch edge → `failed{message:"condition: no <true/false> branch"}`. | `succeeded{data: {result: bool}}` |
| **DelayNode** | `tokio::time::sleep(Duration::from_millis(ms))`, but `select!`ed against the stop receiver and capped so a huge `ms` cannot exceed `MAX_RUN`. | `started`, `succeeded` |

**JSONPath in Rust (`json_path.rs`, ~40 lines):** a direct port of
`resolveJsonPath` from `assertions.ts` — same grammar (`$`, `$.a.b`, `$.items[2]`),
same `{ found, value }` result, same lenient equality. It parses
`last_response.body` with `serde_json` (guarding non-JSON → `found=false`). Porting
(not re-inventing) guarantees an extract/condition on the canvas matches an
assertion with the same path.

### 2.5 Safety rails (required)

- **Step limit** `MAX_STEPS = 200`: guards against a cycle in the graph (Condition
  loops) — checked every iteration before executing a node.
- **Wall-clock limit** `MAX_RUN = 300s`: guards a run that stalls on slow requests
  or a large `Delay`; checked every iteration and enforced inside `Delay`.
- **Per-node request timeout** is already enforced by the engine via
  `RequestOptions.timeout_ms` — reused, no new mechanism.
- **Real-request warning**: `workflow_run` is only ever invoked behind an explicit
  UI confirm (§3.4). The blueprint mandates a run banner: *"This runs real requests
  against live endpoints."* No dry-run mode in v1 (documented non-goal).
- **Cancellation**: graceful `watch` stop + `AbortHandle` backstop, identical to
  `subscriptions.rs`, so `workflow_stop` can always tear a run down.

### 2.6 Event contract — the `"workflow-run"` channel

Mirrors `SubEvent` exactly (one channel, route by id, monotonic `seq`, Rust-stamped
`ts`). New enum, same `EventSink` machinery:

```rust
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WorkflowEvent {
    pub run_id: String,
    pub seq: u64,
    pub ts: String,                    // RFC-3339, stamped in Rust
    pub node_id: Option<String>,       // None only for run-level log/complete
    pub kind: WorkflowEventKind,
    #[serde(skip_serializing_if = "Option::is_none")] pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")] pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowEventKind {
    Started,     // node entered
    Succeeded,   // node finished OK (data carries a small summary)
    Failed,      // node errored → run halts (message set)
    Extracted,   // ExtractNode bound a var (data: {var_name, value})
    Log,         // run-level line (start / complete / stopped / limit hit)
}
```

`data`/`message` map straight to the prompt's `{run_id, node_id, kind, data?, message?}`.
The **run registry** is `Mutex<HashMap<String, StopHandle>>` with the same
`deregister`-on-natural-finish behavior as subscriptions.

---

## 3. Canvas — React Flow (`@xyflow/react`, already installed)

### 3.1 FE type mirror — `src/lib/workflow.ts`

A 1:1 discriminated-union mirror of the Rust types (the same way `subscriptions.ts`
mirrors `SubEvent`). No behavior — types only, so the compiler enforces parity.

```ts
export interface NodePosition { x: number; y: number; }
export type RequestSource = { request_ref: string } | { request: StoredRequest };
export type ConditionExpr =
  | { type: "status_equals"; expected: number }
  | { type: "status_in_range"; min: number; max: number }
  | { type: "json_path_exists"; path: string }
  | { type: "json_path_equals"; path: string; expected: string };
export type WorkflowNode =
  | ({ kind: "request"; id: string; position: NodePosition } & RequestSource)
  | { kind: "extract"; id: string; source: string; var_name: string; position: NodePosition }
  | { kind: "condition"; id: string; expr: ConditionExpr; position: NodePosition }
  | { kind: "delay"; id: string; ms: number; position: NodePosition };
export interface WorkflowEdge { from: string; to: string; branch?: boolean; }
export interface Workflow { id: string; name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; }

// Event mirror (workflow-run channel)
export const WORKFLOW_CHANNEL = "workflow-run";
export type WorkflowEventKind = "started" | "succeeded" | "failed" | "extracted" | "log";
export interface WorkflowEvent {
  run_id: string; seq: number; ts: string;
  node_id?: string; kind: WorkflowEventKind; data?: unknown; message?: string;
}
export type NodeRunStatus = "idle" | "running" | "ok" | "fail";
```

**Graph ↔ React Flow adapter** (`src/lib/workflowGraph.ts`, pure + tested):
`toReactFlow(workflow) → { nodes: RFNode[], edges: RFEdge[] }` and
`fromReactFlow(rf) → Workflow`. React Flow needs `{ id, type, position, data }`
per node and `{ id, source, target }` per edge; our `WorkflowEdge.from/to` map to
`source/target`, and `branch` maps to a `sourceHandle` (`"true"`/`"false"`) on the
Condition node's two handles. Keeping the adapter pure means the whole
serialize/deserialize is unit-testable without a DOM.

### 3.2 Component tree (one component per file — hard rule)

```
src/components/workflow/
  WorkflowEditor.tsx        container: <ReactFlow> + palette + toolbar; owns nothing but layout
  WorkflowToolbar.tsx       name field, Save (→ workflowUpsert), Run/Stop button, run status
  NodePalette.tsx           draggable chips: Request · Extract · Condition · Delay
  nodes/RequestNodeCard.tsx custom node — method badge (method color), name, run status ring
  nodes/ExtractNodeCard.tsx custom node — JSONPath + var_name, shows extracted value on run
  nodes/ConditionNodeCard.tsx custom node — predicate summary, TWO source handles (true/false)
  nodes/DelayNodeCard.tsx   custom node — "wait {ms}ms"
  NodeInspector.tsx         right rail: edit the selected node's fields (request ref, path, expr, ms)
  NodeResponsePanel.tsx     preview the selected node's last response (reuses ResponseBody view)
  edges/BranchEdge.tsx      labeled edge for condition arms (true=success hue, false=neutral)
```

Logic lives in hooks, not components:
```
src/hooks/
  useWorkflowGraph.ts   RF state (nodes/edges), add/connect/delete, dirty flag, save
  useWorkflowRun.ts     the run: listen("workflow-run"), node_id→status map, extracted values
  useWorkflowList.ts    load/select/create/delete saved workflows (workflowList/Upsert/Delete)
```

### 3.3 `useWorkflowRun` — the streaming hook (mirrors `useSubscription`)

Same architecture as `useSubscription`: **one** global `listen(WORKFLOW_CHANNEL)`,
route each event by `run_id === activeRunIdRef.current`, and reduce events into a
per-node status map + extracted values. Reduction rules:

- `started` → `statuses[node_id] = "running"`
- `succeeded` / `extracted` → `statuses[node_id] = "ok"` (extracted also stores
  `data.value` under `extracted[var_name]`, shown on the node + inspector)
- `failed` → `statuses[node_id] = "fail"`, capture `message`, run halts
- `log` (node_id null) → append to a run log; `"run complete"`/`"stopped"` clear
  the active run id

```ts
export interface UseWorkflowRun {
  runState: "idle" | "running" | "done" | "failed" | "stopped";
  statuses: Record<string, NodeRunStatus>;     // node_id → status (drives node rings)
  extracted: Record<string, unknown>;          // var_name → value
  log: WorkflowEvent[];                         // newest-last run trace
  error: string | null;
  run: (workflow: Workflow, environmentId: string | null) => Promise<void>;
  stop: () => void;
}
```

Buffer cap + best-effort `listen` catch + cleanup-on-unmount (calls
`workflow_stop`) are copied verbatim from `useSubscription` (proven, tested pattern).

### 3.4 Run button + real-request confirm

`WorkflowToolbar`'s **Run** calls `useUiStore` to open a confirm dialog:
*"Run this workflow? It sends real requests to live endpoints in **{env}**."* —
the env name colored with `--lok-env-accent` (red for prod, per the design system's
env hues, so a prod run is visually loud). Confirm → `run(workflow, activeEnvId)`.
While running, Run becomes **Stop** (`workflow_stop`).

### 3.5 Where it lives in the UI — a new "Workflows" mode

The app is single-mode today (`AppShell` renders only `RequestWorkbench`). Add a
**mode switch** with the smallest possible change:

- `useUiStore` gains `mode: "requests" | "workflows"` (default `"requests"`,
  persisted alongside `theme`/`locale`) + `setMode`.
- `TitleBar` gains a small **segmented control** (`ModeTabs.tsx`) between the
  `Wordmark` and the `EnvPill`: two tabs, `Requests` · `Workflows`, keyboard-
  focusable, `aria-pressed`, active tab underlined with `--lok-gradient-heat-line`
  (the design system's active-tab treatment). A `⌘2` / `⌘1` hotkey pair toggles,
  registered next to the existing palette hotkey.
- `AppShell` renders `mode === "workflows" ? <WorkflowEditor/> : <RequestWorkbench/>`
  inside the existing `<main>` — sidebar, statusbar, palette, env pill all stay.
- The **Sidebar** in workflow mode lists saved workflows (via `useWorkflowList`)
  instead of the request tree, reusing the same tree/row chrome (new sidebar
  section, not a new sidebar).

### 3.6 Styling, layout, a11y (design system v2)

- **Tokens only** (`--lok-*`): node cards on `--lok-bg-raised`, elevation by light
  not border; method badge uses `--lok-method-*`; the **active/running** node gets
  the heat accent — a `--lok-shadow-heat` glow ring + the `--lok-gradient-heat-line`
  under it, matching the design system's "heat = on/hot, active/progress" rule.
  `ok` → `--lok-success`, `fail` → `--lok-danger` (each with an icon **and** label,
  never color-only).
- **Layout**: `100dvh`, no window scroll. `<ReactFlow>` fills the panel; the node
  inspector + response panel scroll internally. React Flow's own canvas panning is
  not window scroll (it transforms an inner SVG/div) — compliant with the PWA/app-
  shell rule.
- **a11y**: nodes are `tabIndex=0`, `role="group"`, `aria-label` = node kind + name;
  arrow-key selection moves focus between nodes; the palette chips are buttons with
  `aria-label`; `:focus-visible` shows the 3px heat focus ring (`--lok-shadow-focus`).
  React Flow's `nodesFocusable`/`edgesFocusable` are enabled and the built-in
  `aria-label` props set from i18n keys.
- **Motion**: node run-status transitions and edge-traversal highlight animate on
  `--lok-dur-fast`; **`prefers-reduced-motion` collapses them to opacity swaps**
  (hard gate already enforced in `base.css`). No auto-layout animation dance.
- **i18n**: a new `workflow.*` group in `en.ts` (+ mirrored `pl.ts`): node kind
  labels, palette tooltips, the run-confirm copy, status text, empty-state, errors.
  Because `pl` is typed `typeof en`, a missing PL key fails `npm run typecheck`.
  **Default EN, zero Polish visible under EN.**

---

## 4. Test plan (local gate — CI is billing-blocked)

Everything runs in the worktree with a **real** `npm ci` (never a symlinked
`node_modules`), then `npm run typecheck`, `npm run test:unit`, and
`cd src-tauri && cargo test` + `cargo clippy --all-targets -- -D warnings`.

### 4.1 Rust — `workflow.rs` `#[cfg(test)]` (local `std::net::TcpListener` server)

Follows the `resolve.rs` local-server pattern (bind `127.0.0.1:0`, serve canned
responses on a thread). The executor is refactored so the traversal core takes an
injectable "run request" fn (or uses `init_in_memory` + real `engine`), letting
tests assert the graph walk without a Tauri `AppHandle` (emit via a test sink).

1. **two-node happy path (request → extract → request uses the extracted var):**
   node A `GET /a` returns `{"id":"abc"}`; ExtractNode `$.id → token`; node B
   `GET /b` with header `X-Token: {{var.token}}`. Assert the server saw
   `X-Token: abc` — proves run-vars thread through `resolve_spec`.
2. **condition branch:** ConditionNode `status_equals 200` after a node that
   returns 200 → asserts the run follows the `branch=true` edge (and 500 → the
   `branch=false` edge). Assert the terminal node reached matches the branch.
3. **delay:** a `Delay{ms:50}` node measurably delays the run (elapsed ≥ ~50ms)
   and still completes; `select!`-against-stop cancels mid-delay.
4. **step-limit guard:** a graph with a Condition that always loops back emits a
   `failed` with `"step limit"` after `MAX_STEPS`, and does NOT run forever.
5. **missing extract path / dangling request_ref** → `failed` with a clear message,
   run halts (no panic).
6. **json_path.rs port** parity tests: same cases as `assertions.test.ts`
   (`$`, `$.a.b`, `$.items[2].id`, not-found, present-null).

Note: like `resolve_and_send_hits_local_server_*`, any test that touches the
process-wide store connection is `#[ignore]`d by default (it races
`store::tests`' table resets) and run with `--ignored`; the pure traversal tests
run in the normal suite.

### 4.2 Store — `store.rs` `#[cfg(test)]`

- `workflow_upsert` → `workflow_list` round-trips a graph (nodes+edges) intact;
  re-upsert with the same id updates in place (no duplicate); `workflow_delete`
  removes it. Modeled on `snapshot_put/get/delete` tests.
- **backward migration:** open an in-memory DB pinned at `schema_version=2`
  (no `workflows` table), run `migrate`, assert the `workflows` table now exists
  and `schema_version=3`, and that pre-existing `requests`/`snapshots` rows are
  untouched.

### 4.3 FE — Vitest (mock the Tauri IPC + event bus, exactly like `useSubscription.test.ts`)

1. **`workflowGraph.test.ts`**: `toReactFlow`/`fromReactFlow` round-trip a graph;
   condition `branch` maps to/from the true/false `sourceHandle`.
2. **`useWorkflowGraph.test.ts`**: adding a node from the palette, connecting two
   nodes (creates an edge), deleting a node prunes its edges, dirty flag flips,
   **Save calls `workflow_upsert`** with the reconstructed `Workflow`.
3. **`useWorkflowRun.test.ts`**: feed mock `"workflow-run"` events through a mocked
   `listen`; assert `statuses[node_id]` transitions `idle→running→ok`, an
   `extracted` event lands in `extracted[var_name]`, a `failed` event flips the node
   to `fail` + sets `error`, and events for a different `run_id` are ignored (route-
   by-id). Mirrors the `useSubscription` test harness.
4. **i18n parity** is enforced structurally (`pl: Dict = { … }` typed `typeof en`);
   the existing `rebrand.test.ts`-style guard covers "no untranslated key".

### 4.4 Local gate checklist (run in `/tmp/ether-wf`)

```
npm ci                     # real install — NEVER symlink node_modules
npm run typecheck          # tsc --noEmit — catches missing pl keys + type drift
npm run test:unit          # vitest run
cd src-tauri && cargo test
cargo clippy --all-targets -- -D warnings
```

---

## 5. Decisions & open questions (for the implementer)

- **Run-vars → resolve:** a new `var.` namespace on `RenderCtx.vars` (additive
  field), NOT overloading `env`. `resolve_spec` unchanged; only `interp::resolve_token`
  grows one arm. Smallest touch, no collision with user env vars. *(§2.3 — the
  load-bearing decision.)*
- **Whole graph as one `graph_json` blob** (not normalized) — atomic edit/save,
  matches `snapshots.baseline_json`. *(§1.1–1.2.)*
- **RequestSource = ref XOR inline** — a workflow references saved requests but can
  also be self-contained/exportable; refs resolved at run time, dangling ref =
  clean failure (no FK cascade). *(§1.1, §2.4.)*
- **Sequential single-cursor traversal**, start = in-degree-0 node; branching only
  via ConditionNode's true/false edges. No parallel fan-out in v1 (documented
  non-goal) — keeps step/time guards meaningful. *(§2.2.)*
- **Condition/Extract JSONPath is a Rust port of `assertions.ts::resolveJsonPath`**
  → identical semantics to assertions, no new grammar. *(§2.4, §4.1.)*
- **Safety:** `MAX_STEPS=200` + `MAX_RUN=300s` + engine per-request timeout +
  graceful stop; explicit real-request confirm before every run. *(§2.5, §3.4.)*
- **Event channel `"workflow-run"`** — one channel, route by `run_id`, monotonic
  `seq`, Rust-stamped `ts`; `useWorkflowRun` reduces to a `node_id→status` map,
  structurally identical to `useSubscription`. *(§2.6, §3.3.)*
- **UI placement:** a new `mode: "requests" | "workflows"` on `useUiStore` + a
  `ModeTabs` segmented control in `TitleBar`; `AppShell` swaps the main panel;
  sidebar lists saved workflows in workflow mode. *(§3.5.)*

**Open questions (defer past v1):** loop/iterator nodes over an array;
parallel/fan-out branches; a dry-run/preview mode that resolves but does not send;
per-node retry policy; importing an existing request-collection folder as a
workflow skeleton.
