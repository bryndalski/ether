# GraphQL Subscriptions — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + Rust (tokio async runtime, already shipped by `tauri`) + React 19 + TypeScript + `graphql` (graphql-js 17) + design-system v2 (`--lok-*` tokens).
> **New Rust dependency (this feature only):** `tokio-tungstenite` (with `native-tls`/`rustls` TLS) + `futures-util`. This is the single allowed new dependency. Everything else already ships.
> **Contract source of truth:** `src-tauri/src/models.rs` (`StoredRequest.graphql: Option<GraphqlMeta>` with `operation_type` = `"subscription"`) mirrored in `src/lib/types.ts`. **Never invent a persisted field.**
> **Resolution source of truth:** `src-tauri/src/resolve.rs` (`flatten_env` → `build_render_ctx` → `resolve_spec`). Subscriptions **reuse this exact pipeline** so `{{env.*}}` / `{{secret.*}}` interpolation, headers, and auth work over WebSocket for free.
> **Visual pattern:** `design-system/MASTER.md` (heat ramp, `100dvh` no-scroll shell, tabular-nums, `prefers-reduced-motion` hard gate). **Never invent a class/token.**

GraphQL Subscriptions are a **fourth transport mode for the Request Workbench**, layered on top of the GraphQL Explorer (`docs/architecture/graphql-explorer.md`). When `StoredRequest.graphql.operation_type === "subscription"`, `RunButton` becomes a **Subscribe / Unsubscribe** toggle and a **stream panel** replaces the one-shot `ResponseDock`. Everything the Explorer built — the field tree, query editor, docs explorer, variables/headers panels, op-picker — is **reused, not replaced**. The only thing that changes is the **send path**: instead of `resolve_and_send` (one-shot libcurl HTTP), a subscription opens a **long-lived WebSocket** through a new Rust module `subscriptions.rs` and streams events back to the FE over a Tauri event channel.

Hard rules that govern everything below (`design-system/MASTER.md` §6, repo feedback):

- **1 component = 1 file.** All logic in hooks (`src/hooks/*`) or pure helpers (`src/lib/*`); view files stay small (< ~100 lines) and dumb. Types at module scope.
- **Shell:** `100dvh`, **no scrollable window** — only the inner event list scrolls (`.lok-scroll` = `min-height:0` + `overflow:auto`). The stream panel lives inside the Explorer's `1fr` row.
- **A11y non-negotiable:** connection status pairs color with a text label + Lucide icon (never color-only); every icon-only button has `aria-*`; the live event list is an `aria-live="polite"` region; `focus-visible` heat ring; `prefers-reduced-motion` hard gate.
- **Tabular numbers** on the event counter and every timestamp (`.lok-tnums`).
- **Secrets never leave Rust.** The FE passes the templated `StoredRequest`; Rust flattens the env, fetches Keychain secrets, interpolates, and builds the `connection_init` payload + upgrade headers. The FE never holds a secret and never assembles an auth header.

---

## 0. What already exists (reuse, do not rebuild)

| Piece | State | This feature |
|---|---|---|
| `resolve.rs::flatten_env` / `build_render_ctx` / `resolve_spec` | resolves env chain + Keychain secrets + `{{...}}` interpolation → `RequestSpec` | **Reused verbatim** to resolve the subscription endpoint URL, headers, and auth (§1.2). |
| `RequestSpec` (`models.rs`) | `{ id, method, url, headers, auth, options, … }` | The **input** to the WS connector — carries the resolved URL + headers + auth after `resolve_spec`. |
| `Auth` enum (`models.rs`) | `Bearer` / `Basic` / `ApiKey` / `SigV4` | Bearer/Basic/ApiKey supported for WS v1; **SigV4 = best-effort/TODO** (§1.4). |
| `engine.rs` async-command pattern | `#[tauri::command] async fn` + `cancel_registry(): OnceLock<Mutex<HashMap<..>>>` + `spawn_blocking` | **The template** for `subscriptions.rs`: same registry-of-in-flight pattern, but keyed by `subscription_id` and holding a `StopHandle` instead of an `AtomicBool` (§2.4). |
| `GraphqlMeta.operation_type` | `"query" \| "mutation" \| "subscription"` | Already exists — `"subscription"` is the trigger; **no schema change**. |
| `useGraphqlSchema` / `useGraphqlBuilder` / Explorer components | Explorer 3-column body | Reused verbatim; the field tree already offers `subscription` root when the schema has it. |
| `useSendRequest` (`resolve_and_send` lifecycle) | one-shot HTTP send | **NOT used** for subscriptions — a subscription is not a one-shot send. `useSubscription` (§3.1) is its long-lived sibling. |
| `@tauri-apps/api/event` (`listen`, `emit`) | present (Tauri v2) | The streaming channel FE↔Rust (§2.3). |
| `@tauri-apps/api/core` (`invoke`) | present | Wraps the two new commands in `ipc.ts` (§2.5). |

**The only new Rust surface** is `subscriptions.rs` (module + two commands + one event channel) and one new dependency (`tokio-tungstenite`). No change to `models.rs`, `resolve.rs`, `engine.rs`, or the SQLite schema.

---

## 1. Transport (Rust) — `src-tauri/src/subscriptions.rs`

### 1.1 Dependencies (`Cargo.toml`)

```toml
# WebSocket transport for GraphQL subscriptions (graphql-ws protocol).
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
futures-util = "0.3"
```

Rationale:
- `tokio-tungstenite` gives an async WS client over the tokio runtime that `tauri` already spins up (so no second runtime). `native-tls` reuses the system trust store — consistent with libcurl's default verification in the engine. (`rustls-tls-native-roots` is an acceptable alternative; pick one, document it.)
- `futures-util` for `SinkExt`/`StreamExt` (`ws.send(...)`, `ws.next().await`) and `futures::select!` to multiplex "next inbound frame" vs "stop requested".
- `tokio` itself is a transitive dep of `tauri` and is used via `tauri::async_runtime` (which re-exports `tokio::spawn`/`spawn_blocking`) — we do **not** add a direct `tokio` dep; we spawn through `tauri::async_runtime::spawn`, mirroring `engine.rs`'s use of `tauri::async_runtime::spawn_blocking`.

### 1.2 Resolving URL / headers / auth (reuse `resolve.rs`)

A WebSocket connection needs a **fully-resolved** endpoint: the `ws(s)://` URL, the HTTP upgrade headers, and the auth material — with `{{env.*}}` / `{{secret.*}}` already interpolated. We do **not** re-implement any of that; we call the existing pipeline exactly like `resolve_and_send` does:

```
subscription_start(request: StoredRequest, environment_id: Option<String>):
  environments = store::list_environments()
  flat         = resolve::flatten_env(&environments, environment_id)
  ctx          = resolve::build_render_ctx(&environments, environment_id, &flat, redact=false)
  spec: RequestSpec = resolve::resolve_spec(&request, &ctx, redact=false)   // {{env}}/{{secret}} resolved, SigV4 attach attempted
  → connect_and_stream(spec, …)
```

To make `flatten_env` / `build_render_ctx` / `resolve_spec` callable from `subscriptions.rs`, promote them to `pub` (they already are `pub` — see `resolve.rs`) and call `crate::resolve::{flatten_env, build_render_ctx, resolve_spec}`. **No copy-paste of resolution logic.** Optionally add a thin helper in `resolve.rs`:

```rust
/// Resolve a stored request to an executable RequestSpec without sending it.
/// Shared by resolve_and_send (HTTP) and subscriptions (WS).
pub fn build_resolved_spec(
    request: &StoredRequest,
    environment_id: Option<&str>,
) -> Result<RequestSpec, String> {
    let envs = store::list_environments()?;
    let flat = flatten_env(&envs, environment_id);
    let ctx  = build_render_ctx(&envs, environment_id, &flat, false)?;
    resolve_spec(request, &ctx, false)
}
```
…and have `resolve_and_send` use it too (small, safe refactor; keeps one resolution path). **If touching `resolve.rs` is out of scope for the PR, inline the three-call sequence in `subscriptions.rs` instead** — same effect, no cross-file edit.

**From the resolved `RequestSpec` → WS connection:**

| `RequestSpec` field | → WebSocket |
|---|---|
| `url` (`http(s)://…/graphql`) | rewrite scheme: `https`→`wss`, `http`→`ws`; keep host/path/query. This is the WS endpoint. |
| `headers` (`Vec<KeyValue>`) | forwarded as **HTTP upgrade request headers** on the `tokio-tungstenite` handshake (build a `http::Request` with these headers instead of a bare URL). |
| `auth` (already folded into headers by `resolve_spec` for Bearer→`Authorization`, ApiKey→header/query, Basic→`Authorization`, SigV4→signed headers) | Bearer/Basic/ApiKey land in `headers` and thus on the upgrade **and** are echoed into the `connection_init` payload (§1.3). See §1.4 for the WS auth nuance. |

> **Scheme rewrite is the ONLY URL transformation.** `resolve_spec` already percent-encoded query params and interpolated the host, so the resolved `url` is well-formed; we swap only the scheme prefix.

### 1.3 The `graphql-ws` protocol (`graphql-transport-ws`)

Subprotocol header: `Sec-WebSocket-Protocol: graphql-transport-ws` (the modern [graphql-ws](https://github.com/enisdenjo/graphql-ws) protocol — the successor to the legacy `graphql-ws`/`subscriptions-transport-ws`). Message shapes (JSON text frames):

**Client → Server**

| Type | Payload | When |
|---|---|---|
| `connection_init` | `{ payload: { headers/authorization/apiKey/… } }` | first frame after socket open. **We put the resolved auth here** (many servers read auth from `connection_init.payload`, not the upgrade headers — see §1.4). |
| `subscribe` | `{ id, payload: { query, variables, operationName? } }` | after `connection_ack`. `id` = the `subscription_id`. |
| `ping` | `{ payload? }` | keep-alive (optional; we mostly answer server `ping`). |
| `pong` | `{ payload? }` | **reply to a server `ping`** (mandatory — servers close the socket if a `ping` is unanswered). |
| `complete` | `{ id }` | client-initiated stop (`subscription_stop`). Then we close the socket. |

**Server → Client**

| Type | Payload | FE mapping (event `kind`) |
|---|---|---|
| `connection_ack` | — | `status: "open"` — begin sending `subscribe`. |
| `ping` | `{ payload? }` | internal — reply with `pong`; not surfaced to FE. |
| `pong` | `{ payload? }` | internal — liveness; not surfaced. |
| `next` | `{ id, payload: { data, errors? } }` | `kind: "next"`, `data` = `payload`. Each is one stream event. |
| `error` | `{ id, payload: [GraphQLError] }` | `kind: "error"`, `data` = the error array. (Validation failure — the subscription never started.) |
| `complete` | `{ id }` | `kind: "complete"` — server ended the stream; task tears down. |

**Handshake sequence (happy path):**

```
open socket (ws/wss, subprotocol=graphql-transport-ws, upgrade headers)
  → send connection_init { payload }        ── emit status:"connecting"
  ← connection_ack                          ── emit status:"open"
  → send subscribe { id, payload:{query,variables} }
  ← next  { id, payload } ×N                ── emit next  (repeat)
  ← ping                                     → send pong  (internal loop)
  … (stream runs until either side completes) …
  ← complete { id }   OR   subscription_stop(id) → send complete{id} + close
                                            ── emit status:"closed"
```

**Timeouts / liveness:** the graphql-ws spec mandates `connection_ack` within a `connectionInitWaitTimeout` (default 3s server-side). We add a **client-side ack timeout** (e.g. 10s): if no `connection_ack` arrives, emit `status:"error"` (`"handshake timeout"`) and tear down. Server `ping`→`pong` covers ongoing liveness; we do not need our own heartbeat unless a server is silent (optional client-initiated `ping` every 25s is a documented enhancement, off by default).

### 1.4 Auth over WebSocket (Bearer/ApiKey/Basic in v1; SigV4 = best-effort/TODO)

The subtlety: **WS auth is server-dependent.** Two conventions exist and we cover both by default:

1. **Upgrade-header auth** — the `Authorization` / `X-Api-Key` header on the HTTP upgrade request. Works when the gateway authenticates at the handshake (e.g. an ALB / API Gateway `$connect` authorizer). We forward every resolved `spec.headers` entry onto the handshake.
2. **`connection_init.payload` auth** — many Apollo/Hasura/graphql-ws servers ignore upgrade headers (browsers can't set them) and read auth from `connection_init.payload`. We therefore **also** serialize the resolved auth into the payload:
   - `Bearer { token }` → `payload = { "Authorization": "Bearer <token>", "authorization": "Bearer <token>" }` (both casings; some servers are case-sensitive).
   - `ApiKey { name, value, placement: Header }` → `payload = { "<name>": "<value>" }`.
   - `Basic { user, pass }` → `payload = { "Authorization": "Basic <b64>" }`.
   - The FE can also let the user author a **custom `connection_init` payload** (a JSON textarea in the panel, §3.4) that is merged over the auto-derived one — this is the escape hatch for Hasura's `{ headers: { "x-hasura-admin-secret": … } }` shape, etc. The custom payload can itself contain `{{env.*}}`/`{{secret.*}}` and is resolved by the same `interp::render` before being sent (**never** resolved on the FE).

> **Note on `resolve_spec` and auth:** after `resolve_spec`, `Bearer`/`Basic`/`ApiKey(Header)` are already **in `spec.headers`** (the engine folds them; for WS we do the same folding, or read `spec.auth` before it is cleared — implementer's choice, but the values are the resolved, non-templated ones). `ApiKey(Query)` is already in the URL. Either way the FE never sees the secret.

**SigV4 (`Auth::SigV4`) — best-effort / TODO for v1.** Signing a WebSocket handshake with SigV4 is non-trivial: AWS AppSync realtime signs a **canonical GET request to the realtime endpoint** and passes `header`+`payload` as **base64 query params** on a special `wss://…/graphql/realtime` URL, not a plain `Authorization` header — a bespoke flow, not the generic graphql-ws handshake. For v1:
- If `spec.auth` resolves to `SigV4`, **emit `status:"error"` with a clear message**: `"SigV4 over WebSocket is not supported yet (v1). Use Bearer/ApiKey, or an AppSync API key."` — do **not** silently connect unsigned.
- Leave a `// TODO(sigv4-ws): AppSync realtime canonical-request signing` marker and a design note (§1.6) so the AppSync path can be added later behind a feature branch. `resolve_spec` already attempts `attach_sigv4`; the sign output is HTTP-shaped, so we deliberately reject rather than send a wrong signature.

### 1.5 SSE fallback (`graphql-sse`) — interface designed, WS is v1, SSE is TODO

`graphql-sse` (the [graphql-sse](https://github.com/enisdenjo/graphql-sse) "distinct connections mode") streams subscription events over a plain HTTP `text/event-stream` — no upgrade, works through proxies that block WS, and (crucially) can carry the **same auth headers as any HTTP request**, including SigV4, because it *is* an HTTP request. That makes SSE the natural home for the SigV4 case later.

**Decision: WS is v1 (implemented); SSE is a documented TODO — but the transport interface is designed for both now** so adding SSE is additive, not a rewrite:

```rust
/// A transport that streams graphql events for one operation. Both the WS and
/// the (future) SSE connectors implement it; `subscription_start` picks one.
#[async_trait::async_trait]   // or a hand-rolled enum dispatch to avoid the dep
trait SubscriptionTransport {
    /// Open, run to completion, emitting each event via `sink`. Returns when the
    /// stream ends (server complete, error, or stop signalled).
    async fn run(
        self,
        spec: RequestSpec,
        query: String,
        variables: serde_json::Value,
        connection_payload: serde_json::Value,
        sink: EventSink,          // emits SubEvent to the FE (§2.3)
        stop: StopSignal,         // resolves when subscription_stop is called
    ) -> Result<(), String>;
}

struct WebSocketTransport;   // v1 — graphql-transport-ws over tokio-tungstenite
struct SseTransport;         // TODO v2 — graphql-sse over reqwest/hyper streaming
```

Transport selection: default `WebSocket`. A future `RequestOptions`-adjacent hint (or a per-request UI toggle) chooses `Sse`. Because both feed the **same `EventSink` → same `"gql-sub"` channel → same FE panel**, the FE is transport-agnostic (§3). **To avoid the `async_trait` dep,** an equivalent hand-rolled `enum Transport { Ws, Sse }` with a `match` in `run` is acceptable and keeps the new-dependency count at one.

> SSE-on-hyper vs reqwest: `reqwest` (with `stream` feature) is the smaller lift for a chunked `text/event-stream` reader, but it is **another** dependency. Since SSE is a TODO, do not add it now — implement `SseTransport` when the SigV4/proxy need is real, and choose the reader then. The interface above is the only SSE artifact in v1.

### 1.6 Module shape

```
subscriptions.rs
├─ pub async fn subscription_start(request, environment_id, connection_payload?) -> Result<String, String>   // #[tauri::command]
├─ pub fn         subscription_stop(id) -> Result<bool, String>                                              // #[tauri::command]
├─ fn registry() -> &'static Mutex<HashMap<String, StopHandle>>       // OnceLock, mirrors engine::cancel_registry
├─ struct StopHandle { stop_tx: oneshot::Sender<()> | watch::Sender<bool>, abort: AbortHandle }
├─ struct EventSink { app: AppHandle, id: String }   // emit helper → "gql-sub"
├─ enum   Transport { Ws }   // Sse = TODO
├─ async fn ws_connect_and_stream(spec, query, vars, payload, sink, stop)  // the graphql-transport-ws loop
├─ fn ws_url_from(spec: &RequestSpec) -> String       // scheme rewrite https→wss / http→ws
├─ fn connection_init_payload(spec: &RequestSpec, custom: Option<Value>) -> Value  // §1.4
└─ #[cfg(test)] mod tests { /* local WS test server, §4.1 */ }
```

`subscription_start` (async command, mirrors `engine::execute_request`):
1. resolve spec via `resolve::build_resolved_spec` (§1.2);
2. reject `SigV4` (§1.4);
3. mint `id = Uuid::new_v4()`; build `stop` channel + register `StopHandle` in the registry;
4. `let handle = tauri::async_runtime::spawn(ws_connect_and_stream(...))`; store its `AbortHandle` in the `StopHandle`;
5. return `id` **immediately** (the task runs in the background, emitting events).

`subscription_stop(id)`:
1. look up the `StopHandle` in the registry; if absent → `Ok(false)`;
2. signal `stop` (so the task sends `complete{id}` + closes the socket gracefully);
3. as a backstop, `abort` the task after a short grace; deregister; emit `status:"closed"`; `Ok(true)`.

**Cleanup / lifecycle edge cases (document + handle):**
- Task ends on its own (server `complete`/`error`/socket drop) → task deregisters itself from the registry and emits the terminal `status`.
- `subscription_stop` on an already-finished id → `Ok(false)` (fire-and-forget on the FE, mirrors `cancel_request`).
- App/window closing with live subscriptions → a Tauri `on_window_event(CloseRequested)` (or `RunEvent::ExitRequested`) hook drains the registry and stops all (best-effort; the OS closes sockets anyway).
- Multiple concurrent subscriptions → one entry per `id`; the registry is a `HashMap`, fully concurrent.

---

## 2. Streaming to the FE — the `"gql-sub"` event channel

### 2.1 The exact event shape (Rust `SubEvent`, TS `SubEvent`)

One channel, one payload type, discriminated by `kind`. Rust side (serde, `rename_all = "snake_case"` on the enum tag):

```rust
#[derive(Serialize)]
pub struct SubEvent {
    /// The subscription_id this event belongs to. The FE filters on this so one
    /// global listener can serve many concurrent subscriptions.
    pub id: String,
    /// Monotonic per-subscription sequence (0,1,2,…). Lets the FE order/count
    /// deterministically even if two emits land in the same tick.
    pub seq: u64,
    pub kind: SubEventKind,
    /// ISO-8601 UTC emit time (chrono). Rust owns the timestamp so ordering is
    /// authoritative and not subject to FE clock/render lag.
    pub ts: String,
    /// Present for `next` (the {data,errors} payload) and `error` (the error
    /// array). `null` for `status` and `complete`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// Present only for `kind = "status"`: the connection phase.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ConnStatus>,
    /// Present for `error`/failed `status`: a human-readable message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubEventKind { Next, Error, Complete, Status }

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnStatus { Connecting, Open, Error, Closed }
```

TS mirror (`src/lib/types.ts` or a dedicated `src/lib/subscriptions.ts`):

```ts
export type SubEventKind = "next" | "error" | "complete" | "status";
export type ConnStatus = "connecting" | "open" | "error" | "closed";

export interface SubEvent {
  id: string;
  seq: number;
  kind: SubEventKind;
  ts: string;                 // ISO-8601
  data?: unknown;             // next → { data, errors? } ; error → GraphQLError[]
  status?: ConnStatus;        // only when kind === "status"
  message?: string;           // error / failed status
}
```

**Channel name:** `"gql-sub"` (single global channel; the `id` field routes). Every emit is `app_handle.emit("gql-sub", &sub_event)`.

**Emit points (the full event timeline for one subscription):**

| Moment (Rust) | Emitted event |
|---|---|
| immediately after `subscription_start` returns the id, before socket open | `{ kind:"status", status:"connecting" }` |
| `connection_ack` received | `{ kind:"status", status:"open" }` |
| each `next` frame | `{ kind:"next", data: <payload> }` |
| server `error` frame (operation-level) | `{ kind:"error", data:[…], message }` |
| handshake/socket/transport failure | `{ kind:"status", status:"error", message }` |
| server `complete` OR `subscription_stop` OR socket close | `{ kind:"complete" }` then `{ kind:"status", status:"closed" }` |

`seq` increments on **every** emit for that id (status frames included), so the FE has a total order.

### 2.2 Why `emit` (not a Channel or a per-sub event name)

- `app_handle.emit(event, payload)` broadcasts to all webview listeners — exactly one global FE listener (`useSubscription`) filters by `id`. Simpler than minting a Tauri `Channel` per subscription and threading its id back through the return value, and it survives a component remount (the listener re-attaches to the same channel name).
- A per-subscription event name (`"gql-sub:<id>"`) is an alternative but multiplies listeners; the single-channel + `id`-filter keeps one listener regardless of how many subscriptions run.

### 2.3 `EventSink` helper (Rust)

```rust
struct EventSink { app: AppHandle, id: String, seq: AtomicU64 }
impl EventSink {
    fn next(&self, data: Value)       { self.emit(SubEventKind::Next, Some(data), None, None) }
    fn op_error(&self, data: Value)   { self.emit(SubEventKind::Error, Some(data), None, None) }
    fn status(&self, s: ConnStatus, msg: Option<String>) { self.emit(SubEventKind::Status, None, Some(s), msg) }
    fn complete(&self)                { self.emit(SubEventKind::Complete, None, None, None) }
    fn emit(&self, kind, data, status, message) {
        let ev = SubEvent { id: self.id.clone(), seq: self.seq.fetch_add(1, SeqCst), kind,
                            ts: chrono::Utc::now().to_rfc3339(), data, status, message };
        let _ = self.app.emit("gql-sub", &ev);   // best-effort; a closed webview is fine
    }
}
```

### 2.4 Registry & stop handle (mirrors `engine::cancel_registry`)

```rust
fn registry() -> &'static Mutex<HashMap<String, StopHandle>> {
    static R: OnceLock<Mutex<HashMap<String, StopHandle>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}
struct StopHandle {
    stop: watch::Sender<bool>,   // flip true → task sends complete{id} + closes
    abort: tauri::async_runtime::AbortHandle,   // backstop hard-cancel
}
```
Identical shape/discipline to `engine.rs`: `register(id)` / `deregister(id)`, `.lock().expect("registry poisoned")`. The difference is the value type (`StopHandle` vs `AtomicBool`) and that the task is `spawn` (async) not `spawn_blocking`.

### 2.5 Command registration (`lib.rs`) + IPC wrappers (`ipc.ts`)

`lib.rs`:
```rust
pub mod subscriptions;          // add to the module list
// … inside invoke_handler![ … ]:
subscriptions::subscription_start,
subscriptions::subscription_stop,
```
`ipc.ts` (typed wrappers — keys match Rust param names exactly):
```ts
export function subscriptionStart(
  request: StoredRequest,
  environmentId: string | null,
  connectionPayload?: unknown,       // optional custom connection_init payload
): Promise<string> {                 // → subscription_id
  return invoke("subscription_start", { request, environmentId, connectionPayload });
}
export function subscriptionStop(id: string): Promise<boolean> {
  return invoke("subscription_stop", { id });
}
```

---

## 3. Frontend — Subscribe / Unsubscribe + stream panel

### 3.1 `useSubscription` hook — `src/hooks/useSubscription.ts`

The long-lived sibling of `useSendRequest`. Owns the active `subscription_id`, the single `listen("gql-sub")` subscription, the event buffer, connection status, and cleanup.

```ts
export type SubConnState = "idle" | "connecting" | "open" | "error" | "closed";

export interface StreamEvent {
  seq: number; ts: string;
  kind: "next" | "error";
  payload: unknown;            // next: {data,errors?} ; error: GraphQLError[]
}

export interface UseSubscription {
  connState: SubConnState;
  events: StreamEvent[];       // newest-first
  eventCount: number;
  error: string | null;
  subscribe: (draft: StoredRequest, environmentId: string | null) => Promise<void>;
  unsubscribe: () => void;
  clear: () => void;           // empties the buffer, keeps the connection
}
```

Behaviour:
- `subscribe(draft, envId)`:
  1. guard: `draft.graphql?.operation_type === "subscription"` and a non-empty query;
  2. `const id = await subscriptionStart(draft, envId, customPayload?)`; store it in a ref;
  3. set `connState:"connecting"`, reset `events`/`eventCount`.
- **One global `listen("gql-sub", …)`** attached in a `useEffect` on mount (not per-subscribe), storing the `unlisten` fn in a ref. The handler:
  - ignores events whose `event.payload.id !== activeIdRef.current` (routing);
  - `status` → maps `ConnStatus` → `connState` (and sets `error` on `"error"`);
  - `next` / `error` → **prepend** to `events` (newest-first), bump `eventCount`;
  - `complete` → set `connState:"closed"`, clear the active id ref.
- `unsubscribe()`:
  - fire-and-forget `void subscriptionStop(id).catch(()=>{})` (mirrors `cancel()` in `useSendRequest`);
  - optimistic `connState:"closed"`; clear the active id ref. Does **not** unlisten (the global listener lives with the hook).
- **Cleanup on unmount / active-request change:** the mount `useEffect` returns `() => { unlisten(); if (activeId) void subscriptionStop(activeId); }`. Switching the workbench to another request (or to query/mutation mode) triggers `unsubscribe()` first so no orphan socket leaks. A bounded buffer (e.g. cap `events` at 500, drop oldest) prevents unbounded memory on a chatty stream — documented cap, tabular counter still shows total received.

### 3.2 `RunButton` → Subscribe / Unsubscribe (extend, don't fork)

`RunButton` (`src/components/graphql/RunButton.tsx`) currently switches on `SendState.phase` (busy → Cancel). For a subscription op it must instead reflect `SubConnState`. Two clean options — **prefer B** to keep 1-component-1-file and avoid conditionals bleeding into the REST/query path:

- **A (extend):** add optional subscription props (`subConn?`, `onSubscribe`, `onUnsubscribe`); when present, render Subscribe/Unsubscribe/Reconnecting instead of Run/Cancel.
- **B (sibling, preferred):** a new `SubscribeButton.tsx` (its own file) used by the Explorer toolbar when `opType === "subscription"`; `RunButton` stays untouched for query/mutation. `ExplorerToolbar` picks the button by `opType`.

`SubscribeButton` states (label + Lucide icon + `aria-*`, **never color-only**):

| `connState` | Label | Icon | Class | Action |
|---|---|---|---|---|
| `idle` / `closed` | **Subscribe** | `i-play` (or `i-broadcast`) | `.btn-send` (heat gradient) | `onSubscribe` |
| `connecting` | **Connecting…** | spinning `i-refresh`, `aria-busy` | `.btn-send.lok-heat-gradient--animated` | `onUnsubscribe` (cancel) |
| `open` | **Unsubscribe** | `i-x` (live dot = success hue) | `.btn-send.lok-heat-gradient--animated` (subtle "live" pulse, reduced-motion-safe) | `onUnsubscribe` |
| `error` | **Retry** | `i-alert` | `.btn-send` | `onSubscribe` |

The "live" pulse is the fourth possible motion moment; keep it inside the `prefers-reduced-motion` gate (opacity-only fallback) and ≤ the design-system's `dur-base`. It reuses the existing heat gradient — no new token.

### 3.3 Stream panel — `SubscriptionStream.tsx` (+ small child views)

Replaces `ResponseDock` (Zone 3) when `opType === "subscription"`. Layout (all inside the Explorer's `1fr` row; the shell never scrolls):

```
SubscriptionStream (container; owns useSubscription via props or lifts to Explorer)
├─ StreamStatusBar        (connState badge + event counter + Clear button)
│    ├─ ConnStatusBadge   ← color + text label + icon (connecting/open/error/closed)
│    ├─ <span class="lok-tnums">{eventCount} events</span>
│    └─ Clear button (i-trash, aria-label)
└─ StreamEventList  (.lok-scroll, aria-live="polite", newest-first)
     └─ StreamEventRow ×N  ← timestamp (.lok-tnums) + kind badge + pretty JSON (collapsed/expand)
```

- **ConnStatusBadge** maps `connState` → `{ label, icon, hue }` using **semantic tokens only** (MASTER §1.5): `open`→success (`#3ddc97`) + `i-check`/live-dot; `connecting`→info/heat + spinner; `error`→danger (`#ff6b6b`) + `i-alert`; `closed`/`idle`→neutral + `i-square`. Icon **and** text, always.
- **StreamEventRow:** `ts` rendered relative + absolute on hover (reuse `relativeTime.ts`), `.lok-tnums`; `kind` badge (`next` neutral/success, `error` danger); body = pretty-printed JSON (reuse the existing JSON formatter used by `ResponseDock`; a CodeMirror read-only JSON view or a `<pre>` with the repo's `format.ts`). Rows virtualize only if the cap is raised; at ≤500 a plain map is fine.
- **Newest-first** so the latest event is always at the top without auto-scroll fighting the user; the list container scrolls, the window does not.
- **Empty state** (before first event / while connecting): `EmptyState` ("Waiting for events…", hint "Events stream in as the server pushes them.").
- **Clear** empties the buffer (`useSubscription.clear()`) without touching the live socket — the counter keeps counting total-received (or resets, per UX choice; document which — recommend: Clear resets the visible list AND the counter, since the counter is "events in view").

### 3.4 Custom `connection_init` payload (optional, escape hatch)

A collapsible JSON textarea in the variables/headers column (reuse `OperationVarsPanel`'s pattern) labelled "Connection payload". Its content (may contain `{{env}}`/`{{secret}}`) is passed as `connectionPayload` to `subscriptionStart` and **merged in Rust over the auto-derived auth payload** (§1.4) after interpolation. Default empty → auto-derived payload only. This unblocks Hasura/AppSync-api-key shapes without a code change.

### 3.5 Wiring in `GraphqlExplorer` / `ExplorerToolbar`

- `GraphqlExplorer` gains a branch: when `builder.opType === "subscription"`, render `SubscriptionStream` in Zone 3 and pass `SubscribeButton` (not `RunButton`) into `ExplorerToolbar`. The 3-column body (tree/editor/docs) is unchanged — the user builds a subscription operation exactly like a query.
- The `useSubscription` hook is owned at the Explorer level (or a thin `useWorkbenchStream`), so switching op-type or request tears the stream down via its cleanup.
- `onRun`/`onCancel` (query/mutation) and `onSubscribe`/`onUnsubscribe` (subscription) are distinct handlers; the toolbar shows exactly one pair based on `opType`.

---

## 4. Test plan

### 4.1 Rust — `subscriptions.rs` `#[cfg(test)]` (local graphql-ws server)

Spin a **real local WebSocket server** in the test (using `tokio-tungstenite`'s `accept_async` on an ephemeral `127.0.0.1:0` loopback, on a tokio task) that speaks `graphql-transport-ws`. Mirror the `resolve.rs` local-TCP-server test discipline (bind `127.0.0.1:0`, serve on a spawned task, assert on both sides). Because these drive async + `tauri::async_runtime`, run them under `tauri::async_runtime::block_on` or `#[tokio::test]` (tokio is available transitively; if a direct `#[tokio::test]` macro isn't in scope, use `block_on`).

**Test server behaviour (parameterizable per test):**
- accept upgrade, assert subprotocol `graphql-transport-ws` and (optionally) an `Authorization` upgrade header / `connection_init.payload`;
- on `connection_init` → send `connection_ack`;
- on `subscribe{id}` → send N `next{id,payload:{data:…}}` then `complete{id}`;
- variants: never-ack (handshake timeout), send `error{id}` (validation), send malformed JSON, close socket mid-stream.

**Cases:**

1. **`start → connection_ack → next → complete`** — call `ws_connect_and_stream` (or `subscription_start` with a stubbed `AppHandle`/`EventSink` collecting into a `Vec`) against the server; assert the emitted `SubEvent` sequence is `status:connecting, status:open, next(×N), complete, status:closed` with monotonic `seq` and the `next.data` matching what the server sent.
2. **stop → client `complete` + close** — start, receive one `next`, call `subscription_stop(id)`; assert the server observed a client `complete{id}` frame and the socket closed, and the FE-side saw `complete` + `status:closed`.
3. **auth forwarded** — server asserts the upgrade `Authorization` header **and** `connection_init.payload.Authorization` equal the resolved bearer; drive through `resolve::build_resolved_spec` with an env var + a stubbed secret so `{{secret.token}}` → real value (reuse the `resolve.rs` test env/ctx helpers; inject the secret via the ctx to avoid the Keychain, as `resolve.rs` tests already do).
4. **ping/pong** — server sends `ping`; assert the client replies `pong` and the stream continues (no spurious `complete`).
5. **malformed / handshake-timeout / mid-stream close** — server never acks → `status:error` ("handshake timeout") within the client timeout; server sends non-JSON → `status:error` (parse), no panic; server drops socket mid-stream → `status:closed` (or `error`) emitted, registry entry deregistered, no leaked task.
6. **SigV4 rejected** — `subscription_start` with `Auth::SigV4` returns `Err`/emits `status:error` with the "not supported yet" message; **no** socket is opened.
7. **`ws_url_from` scheme rewrite** — pure unit: `https://…`→`wss://…`, `http://…`→`ws://…`, path/query preserved.
8. **registry lifecycle** — after `complete`, `subscription_stop(id)` returns `Ok(false)` (already gone); two concurrent ids coexist and stop independently.

`cargo clippy --all-targets -- -D warnings` must pass (no `unwrap()` in non-test paths beyond the established `.expect("registry poisoned")` convention; `let _ =` on best-effort emits).

### 4.2 FE — `useSubscription.test.ts` (mock the Tauri event bus + IPC)

Mock `@tauri-apps/api/event`'s `listen` (capture the handler, return a spy `unlisten`) and `../lib/ipc`'s `subscriptionStart`/`subscriptionStop` (Vitest, jsdom — matches the repo's existing hook tests, e.g. `useSendRequest.test.ts`). Render the hook with `@testing-library/react`'s `renderHook`.

**Cases:**

1. **`next` appends** — `subscribe()` resolves an id; fire a mocked `"gql-sub"` event `{id, kind:"next", data}` through the captured handler → `events` has 1 entry (newest-first), `eventCount === 1`.
2. **routing by id** — an event with a different `id` is ignored (no state change).
3. **status transitions** — `status:connecting`→`connState:"connecting"`; `status:open`→`"open"`; `status:error`→`"error"` + `error` set.
4. **`complete` closes** — `status:closed`/`complete` → `connState:"closed"`, active id cleared.
5. **`unsubscribe` calls `subscriptionStop`** — assert the IPC spy was called with the active id; `connState` optimistic `"closed"`.
6. **cleanup on unmount** — unmount → the captured `unlisten` spy is called **and** `subscriptionStop` is called if a subscription was live (no orphan).
7. **op-type / request switch** — changing to a query op (or a different request id) triggers `unsubscribe` before a new subscribe (no double-live).
8. **`clear`** — empties `events`/`eventCount`, leaves `connState` untouched.
9. **buffer cap** — pushing > cap events keeps only the newest `cap` (oldest dropped), counter reflects the policy.

Plus a light `SubscriptionStream` render test (optional): `ConnStatusBadge` shows label+icon per state (never color-only), the counter uses `.lok-tnums`, and the event list is `aria-live="polite"`.

### 4.3 Local gate (CI is billing-blocked — run everything in the worktree)

In `/tmp/lok-subs`, **always `npm ci`** (never symlink `node_modules`), then:
```
npm run typecheck
npm run test:unit
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```
This blueprint PR is **docs-only** — the gate for it is `typecheck`+`test:unit` (unaffected) + `cargo test`/`clippy` on the untouched Rust (must stay green). The implementation PR that follows must pass the full gate with the new tests above.

---

## 5. Decisions & open questions (for the implementer)

| Decision | Choice (v1) | Rationale |
|---|---|---|
| WS vs SSE | **WS implemented; SSE = designed interface + TODO** | WS covers the common graphql-ws servers; SSE deferred until the SigV4/proxy need is concrete (SSE is where SigV4 becomes tractable since it's plain HTTP). |
| Protocol | `graphql-transport-ws` (modern graphql-ws) | The current standard; legacy `subscriptions-transport-ws` can be added as a second subprotocol negotiation later. |
| Header resolution | **Reuse `resolve.rs` (`build_resolved_spec`)** — no re-implementation | `{{env}}/{{secret}}` + auth folding + (attempted) SigV4 already live there; the WS path only rewrites the scheme and forwards headers + a `connection_init` payload. |
| Auth placement | Upgrade headers **and** `connection_init.payload` (both), + custom payload merge | Servers split between the two conventions; sending both maximizes compatibility. Custom payload unblocks Hasura/AppSync-api-key. |
| SigV4 over WS | **Rejected with a clear error in v1**; AppSync-realtime canonical-request signing is a TODO | Correctly signing a WS handshake is bespoke (AppSync base64 query-param header/payload) — better to fail loudly than send a wrong signature. |
| Streaming channel | Single global `app_handle.emit("gql-sub", SubEvent)`; FE filters by `id` | One listener serves many subscriptions; survives remounts; simpler than per-sub `Channel`s. |
| Event shape | `{ id, seq, kind, ts, data?, status?, message? }`; `kind ∈ {next,error,complete,status}`; Rust owns `seq`+`ts` | Deterministic ordering/counting; `id` routes; terminal `status:closed` always closes the FE state. |
| Registry | `OnceLock<Mutex<HashMap<String, StopHandle>>>`, one per `id` | Mirrors `engine::cancel_registry` exactly; `StopHandle` = `watch::Sender<bool>` (graceful) + `AbortHandle` (backstop). |
| Task spawn | `tauri::async_runtime::spawn` (async), not `spawn_blocking` | WS I/O is async; matches Tauri's tokio runtime; `engine.rs` uses `spawn_blocking` only because libcurl is blocking. |
| `RunButton` vs new button | **New `SubscribeButton.tsx`** (1 component = 1 file); `RunButton` untouched | Keeps the REST/query path clean; toolbar picks by `opType`. |

**Open questions to confirm during implementation:**
- Does "Clear" reset the event **counter** or only the visible list? (Recommend: reset both — the counter is "events in view".)
- Buffer cap value (recommend 500) and drop policy (drop-oldest) — surface as a constant.
- Should a cache-hit schema auto-offer `subscription` root only when the schema declares a Subscription type? (Yes — `availableOperations` already disables it otherwise; no change needed.)
- `native-tls` vs `rustls-tls-native-roots` for `tokio-tungstenite` — pick to match the engine's trust behaviour (recommend `native-tls` for parity with libcurl's system store on macOS).
