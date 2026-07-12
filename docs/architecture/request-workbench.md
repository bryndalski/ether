# Request Workbench — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + CodeMirror 6 + Tailwind v4 (utility-only) + design-system v2 (`--lok-*` tokens).
> **Visual pattern (1:1):** `design-system/preview/mock-request.html` + `design-system/preview/style.css`. Every class name / token below is drawn from those files and `src/styles/tokens.css`.
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored in `src/lib/types.ts`). **Never** invent a field.
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered commands) + `src/lib/ipc.ts` (typed wrappers).

The Request Workbench is Zone 2 (editor) + Zone 3 (response) of the existing three-zone `AppShell`. This blueprint **replaces the placeholder** `RequestEditor`/`RequestToolbar`/`SendButton`/`ResponseDock` with a fully wired workbench, and adds a live-request draft layer. The titlebar, sidebar, statusbar, env pill and command palette already exist; this blueprint only refers to them where the workbench touches them (and upgrades `CollectionsSidebar` search/tree/new-request affordances to match the mock).

Hard rules that govern everything below (from `design-system/MASTER.md` §6, and repo feedback):
- **1 component = 1 file.** All logic in hooks; view files stay small and dumb. Types at module scope.
- **PWA/desktop shell:** `100dvh`, **no scrollable window** — only inner panes (`.pane`, `.resp-body`, `.tree`) scroll via `.lok-scroll`.
- **A11y non-negotiable:** `focus-visible` heat ring (already in `base.css`), `aria-*` on every icon-only button, AA contrast (tokens already verified), `prefers-reduced-motion` hard gate (already in `base.css`).
- **Tabular numbers** (`.lok-tnums` / `font-variant-numeric: tabular-nums`) on every timer / status code / size / waterfall ms.
- **Icons:** Lucide, stroke 1.5, `currentColor`, inline SVG (the mock inlines the exact paths — reuse them via a shared `<Icon>` sprite component; do **not** add a CDN).
- **Secrets never leave Rust for previews.** The FE **must not** call `to_curl` for the cURL preview — only `resolve_preview_curl` (redaction happens in Rust).

---

## 1. Component tree

Directory: `src/components/workbench/` (new), reusing `src/components/common/*` and the existing topbar/statusbar/sidebar. Each row = one file.

```
AppShell (existing — unchanged wiring, mounts Workbench in Zone 2+3)
│
├── sidebar/CollectionsSidebar         (upgrade of existing Sidebar)
│   ├── sidebar/SidebarHeader          (search input + "+" new-request icon-button)
│   │   └── common/Icon (#i-search, #i-plus)
│   ├── sidebar/CollectionTree         (existing — tree of folders + requests)
│   │   ├── sidebar/TreeGroup          (folder row: chevron + folder icon + label)
│   │   └── sidebar/RequestRow         (existing — MethodBadge + name, active heat bar)
│   └── common/MethodBadge             (existing — method color chip)
│
└── workbench/RequestWorkbench         (Zone 2+3 orchestrator; owns useRequestDraft + useSendRequest)
    ├── workbench/RequestBar           (44px toolbar row)
    │   ├── workbench/MethodSelect      (colored method dropdown)
    │   ├── workbench/UrlInput          (mono URL field, {{var}} highlight)
    │   └── workbench/SendButton        (upgrade of editor/SendButton — heat gradient + states)
    │
    ├── workbench/RequestTabs           (Params / Headers / Body / Auth / cURL — with counts)
    │   └── (renders one of the panels below by active tab)
    │       ├── workbench/ParamsPanel        → KeyValueTable(kind="params")
    │       ├── workbench/HeadersPanel        → KeyValueTable(kind="headers")
    │       ├── workbench/BodyPanel           → BodyModeSelect + BodyEditor / KeyValueTable(form) / MultipartTable
    │       │   ├── workbench/BodyModeSelect  (none | raw json | form-urlencoded | multipart)
    │       │   └── workbench/BodyEditor      (CodeMirror lang-json)
    │       ├── workbench/AuthPanel           → AuthTypeSelect + AuthForm (per Auth variant)
    │       │   ├── workbench/AuthTypeSelect  (none | bearer | basic | api_key | sig_v4)
    │       │   └── workbench/AuthForm        (fields switch on selected type)
    │       └── workbench/CurlTab             (two-way: paste curl → from_curl; view → resolve_preview_curl)
    │       └── workbench/KeyValueTable       (shared enable/disable rows — params, headers, form fields)
    │
    └── response/ResponseDock            (upgrade of existing ResponseDock; Zone 3)
        ├── response/StatusBadge          (status code + reason, colored by class, pop animation)
        ├── response/ResponseMeta         (Time / Size / TLS — tabular-nums)
        ├── common/TabBar                 (existing — Body / Headers / Timeline / curl -v)
        └── (renders one of the response tabs)
            ├── response/ResponseBody      → CodeMirror read-only, JSON pretty
            ├── response/ResponseHeaders   → KeyValueList (read-only)
            ├── response/TimelineWaterfall  (phase bars proportional to timings)
            └── response/VerboseLog        (curl -v pane, redacted, from ResponseData.verbose_log)
```

Env pill + quick-look (`topbar/EnvPill`, `topbar/EnvQuickLook`) already exist and remain the source of `environmentId` for Send/preview — no changes needed beyond confirming they read `useEnvStore.activeEnvironmentId`.

### 1.1 Per-component spec

Legend — **file** · **props** · **responsibility** · **classes/tokens** (from `style.css` / `tokens.css`).

#### Shared

**`common/Icon.tsx`** — `{ name: IconName; size?: number; className?: string }` (`IconName` = union of the sprite ids). Renders `<svg><use href={"#" + name}/></svg>`. Responsibility: single inline-SVG sprite entry point so no CDN and one source of Lucide paths. Ship the `<svg><defs>…</defs></svg>` sprite (copied verbatim from the mock's `#i-*` symbols) as **`common/IconSprite.tsx`**, mounted once at the top of `AppShell`. Tokens: `currentColor`, sizes 13/15/16px per mock.

**`workbench/KeyValueTable.tsx`** — `{ rows: KeyValue[]; onChange: (rows: KeyValue[]) => void; keyPlaceholder?: string; valuePlaceholder?: string; keyClassName?: string }`. Responsibility: the enable/disable KV grid used by Params, Headers, and form body. A trailing empty "ghost" row auto-appends a new entry on first edit; the `✕` button removes a row. **No** local component state for the rows — it is a controlled list driven by `useRequestDraft`. Classes: `.kv-head`, `.kv`, `.kv input`, `.kv .k` (key column tinted `--lok-syn-key`), `.kv .rm` (remove, hover → `--lok-status-danger` / `--lok-status-danger-bg`). Checkbox toggles `KeyValue.enabled`. A11y: checkbox has `aria-label={"Włącz " + name}`; remove button `aria-label={"Usuń " + name}`.

#### Zone 2 — request

**`workbench/RequestWorkbench.tsx`** — no props (reads active request from `useCollectionsStore`). Responsibility: instantiate `useRequestDraft(activeRequest)` and `useSendRequest()`, own the active-tab state for `RequestTabs`, wire keyboard `⌘↵` → send, lay out `RequestBar` → `RequestTabs` → `ResponseDock` in a `.editor` column. Renders `EmptyState` (existing) when there is no active request. Classes: `.editor` (`display:flex;flex-direction:column;background:var(--lok-bg-surface)`).

**`workbench/RequestBar.tsx`** — `{ draft: RequestDraft; onDraftChange: DraftDispatch; sendState: SendState; onSend: () => void; onCancel: () => void }`. Responsibility: the 44px toolbar row (`.toolbar`, `height:var(--lok-toolbar-h)`, `border-bottom:1px solid var(--lok-border-subtle)`). Composes `MethodSelect` + `UrlInput` + `SendButton`.

**`workbench/MethodSelect.tsx`** — `{ method: string; onChange: (m: string) => void }`. Responsibility: method dropdown, colored by verb. Classes: `.method-select` container; the label uses `.method .method--get/post/put/patch/delete/head/options` (color-mix 14% tint + hue text, exactly like `style.css` `.method.get` etc.); chevron via `Icon name="i-chev"`. Use a native `<select>` visually styled OR a custom listbox; **native `<select>` is preferred** for a11y + keyboard. Options: `GET POST PUT PATCH DELETE HEAD OPTIONS`. Tokens: `--lok-method-*`, `--lok-bg-raised`, `--lok-border-default`.

**`workbench/UrlInput.tsx`** — `{ url: string; onChange: (url: string) => void }`. Responsibility: monospace URL field. Classes: `.url-field` (`font-family:var(--lok-font-mono)`, `font-size:var(--lok-fs-md)`, focus → `--lok-border-focus` + `--lok-focus-ring`). `{{var}}` template tokens rendered in `--lok-heat-300` (`.url-field .var`). **Implementation note:** a plain `<input>` cannot color a substring; render a lightweight CodeMirror single-line or an overlay-highlight `<div>` mirror behind a transparent-text input. Simplest acceptable v1: plain `<input aria-label="URL requestu">` (no inline highlight) — colored `{{var}}` is a nice-to-have, gate it behind a small `useTemplateHighlight` helper if time permits. A11y: `aria-label`, `spellCheck={false}`, `autoComplete="off"`.

**`workbench/SendButton.tsx`** (replaces `editor/SendButton.tsx`) — `{ sendState: SendState; disabled: boolean; onSend: () => void; onCancel: () => void }`. Responsibility: the signature action.
- `idle` / `success` / `error` / `canceled`: heat gradient fill (`.btn-send` from `style.css` — `background:var(--lok-gradient-heat)`, `hover` glow `box-shadow`, `active` scale .97), `Icon name="i-send"` + label "Send" + `⌘↵` kbd hint.
- `interpolating` | `in-flight`: swap label to "Sending…", add class `.lok-heat-gradient--animated` (animated heat), and turn the button into a **Cancel** affordance — click calls `onCancel` (`cancel_request`). Show a small spinner/`✕` (`Icon name="i-x"`). `aria-busy={true}` while in flight.
- `disabled` when the URL is empty (`background:var(--lok-bg-raised)`, `disabled:opacity-60`).
Tokens: `--lok-gradient-heat`, `--lok-shadow-heat`, `--lok-text-on-heat`, `--lok-fw-semibold`. Motion honors reduced-motion (base.css gate). A11y: `aria-label` reflects current state ("Wyślij request" / "Anuluj request").

**`workbench/RequestTabs.tsx`** — `{ active: RequestTabKey; onSelect: (t: RequestTabKey) => void; counts: Record<RequestTabKey, number> }`. Responsibility: the request tab strip (`.req-tabs`, `height:var(--lok-tabbar-h)`). Tabs `Params | Headers | Body | Auth | cURL`; each shows a `.count` chip when > 0 (enabled params/headers count, etc.). Active tab underline = heat (`.tab.active::after` uses `--lok-gradient-heat-x`). `role="tablist"`, arrow-key navigation, `aria-selected`. Reuse the existing `common/TabBar` if its API is extended to accept per-tab counts; otherwise a workbench-local strip using the `.tab`/`.count` classes.

**`workbench/ParamsPanel.tsx`** — `{ params: KeyValue[]; onChange: (p: KeyValue[]) => void }` → renders `KeyValueTable` (`keyPlaceholder="Param"`, `valuePlaceholder="Value"`). Wrapped in `.pane` (scroll) + `.pane-inner` (pad). Responsibility: nothing beyond passing through — this is where **Params↔URL sync** is surfaced (the sync itself lives in `useRequestDraft`, see §2).

**`workbench/HeadersPanel.tsx`** — `{ headers: KeyValue[]; onChange }` → `KeyValueTable` with the header column tinted (`.kv .k` already `--lok-syn-key`). `.pane`/`.pane-inner`.

**`workbench/BodyPanel.tsx`** — `{ body: Body; onChange: (b: Body) => void }`. Responsibility: choose body mode and render the right editor. Renders `BodyModeSelect` then, by `body.type`:
- `none` → hint text.
- `raw` → `BodyEditor` (CodeMirror). Content-type sub-select (JSON / XML / text) sets `content_type`.
- `form_urlencoded` → `KeyValueTable` over `body.fields`.
- `multipart` → `MultipartTable` (text/file parts).
Switching mode maps between `Body` variants **preserving text where sensible** (see §2.3). `.pane`/`.pane-inner`.

**`workbench/BodyModeSelect.tsx`** — `{ mode: BodyMode; onChange: (m: BodyMode) => void }` (`BodyMode = "none" | "raw-json" | "raw-xml" | "raw-text" | "form" | "multipart"`). Small segmented control / select styled like `.method-select`.

**`workbench/BodyEditor.tsx`** — `{ value: string; contentType: string; onChange: (text: string) => void }`. Responsibility: CodeMirror 6 editor. Use `@uiw/react-codemirror` (already a dep) with `@codemirror/lang-json` when the content type is JSON. Dark theme via existing tokens (`--lok-bg-code`, syntax `--lok-syn-*`). Provide a JSON `linter` (`@codemirror/lint`, a dep) that surfaces parse errors — non-blocking (Send is still allowed; Rust validates). A11y: labelled editor region; reduced-motion has no effect here.

**`workbench/AuthPanel.tsx`** — `{ auth: Auth; onChange: (a: Auth) => void }`. Renders `AuthTypeSelect` + `AuthForm`. `.pane`/`.pane-inner`.

**`workbench/AuthTypeSelect.tsx`** — `{ type: AuthType; onChange }` (`AuthType = "none" | "bearer" | "basic" | "api_key" | "sig_v4"`). Select styled like `.method-select`. Switching type produces a fresh default `Auth` of that variant.

**`workbench/AuthForm.tsx`** — `{ auth: Auth; onChange: (a: Auth) => void }`. Responsibility: render fields per the `Auth` union (from `types.ts`), all in `.kv`-style mono inputs:
- `bearer` → `token`.
- `basic` → `username`, `password` (password field `type="password"`).
- `api_key` → `name`, `value`, `placement` (`header` | `query` toggle).
- `sig_v4` → `profile`, `region`, `service`.
Secret-bearing fields (`token`, `password`, `value`) should encourage `{{secret.NAME}}` (a hint). **The FE never resolves secrets** — it just stores the template. A11y: each input `aria-label`ed; password toggle has an `aria-pressed` show/hide.

**`workbench/CurlTab.tsx`** — `{ draft: RequestDraft; storedRequest: StoredRequest; environmentId: string | null; onImport: (spec: RequestSpec) => void }`. Responsibility: the **two-way** curl surface.
- **View direction (draft → redacted curl):** on tab open (and on debounced draft change), call `resolvePreviewCurl(storedRequestFromDraft, environmentId)` (IPC `resolve_preview_curl`). Render the returned string in a read-only mono pane (`.curl-log` styling; `>`/`<`/`*`/redact spans). **Never** call `to_curl` here — redaction is Rust's job.
- **Import direction (curl → draft):** a textarea/paste box + "Import" button → `fromCurl(command)` (IPC `from_curl`) returns a `RequestSpec`; map it onto the draft via `onImport` (see §2.4 mapping). Show `from_curl` errors inline.
Copy button (`Icon name="i-copy"`) copies the previewed (redacted) command. A11y: labelled textarea, `aria-live="polite"` for import errors.

#### Zone 3 — response

**`response/ResponseDock.tsx`** (replaces existing) — `{ sendState: SendState; response: ResponseData | null; errorMessage: string | null }`. Responsibility: the bottom (or right) dock. Empty state until first Send (`EmptyState`, existing). On success: header (`StatusBadge` + `ResponseMeta`) + `TabBar` (`Body | Headers | Timeline | curl -v`) + active tab body. On error/canceled: an error banner using `--lok-status-danger` / `--lok-status-danger-bg` with the message + a retry affordance. Classes: `.response` (arrival animation `dock-rise`), `.resp-head`, `.resp-tabs`, `.resp-body`. Reads placement/size from `useUiStore` (existing bottom/right + resize). Panes scroll via `.lok-scroll`.

**`response/StatusBadge.tsx`** — `{ status: number; httpVersion: string }`. Responsibility: big mono status code + reason text, colored by class. Classes: `.resp-status .code` (`--lok-fs-lg`, bold, `font-variant-numeric:tabular-nums`, `pop` spring animation) + `.txt`. Color: `--lok-status-success` (2xx), `--lok-status-info` (3xx), `--lok-status-warn` (4xx), `--lok-status-danger` (5xx), `--lok-status-neutral` (1xx / 0). Reason string from a small `statusText(status)` map. **Never color-only** — pair the code with the reason label (a11y). `aria-live="polite"` so a screen reader announces the new status.

**`response/ResponseMeta.tsx`** — `{ timings: Timings; sizeBytes: number; tls: TlsInfo | null }`. Responsibility: `Time <b>{total_ms} ms</b>` · `Size <b>{humanBytes}</b>` · `TLS <b>{tls.protocol}</b>`. Classes: `.resp-meta` (mono, tabular-nums). `humanBytes` + `ms` formatting helpers live in `src/lib/format.ts` (new).

**`response/ResponseBody.tsx`** — `{ body: string; isBase64: boolean; truncatedAt: number | null; contentType?: string }`. Responsibility: pretty JSON (CodeMirror read-only, `lang-json`, folding) or raw text; base64/binary → a "binary body ({size}) — save to file" affordance (no decode in v1). Truncation banner when `truncatedAt != null`. `.resp-body pre`, `--lok-lh-code`, tokens `--lok-syn-*`. `.lok-selectable` so users can select/copy.

**`response/ResponseHeaders.tsx`** — `{ headers: KeyValue[] }`. Responsibility: read-only two-column mono list of response headers (reuse `.kv` grid visually, no inputs). Count chip feeds the tab.

**`response/TimelineWaterfall.tsx`** — `{ timings: Timings }`. Responsibility: the proportional phase waterfall. Compute per-phase durations from cumulative libcurl timings (see §3.4), then render 5 stacked bars whose `left`/`width` are **percentages of total_ms**, colored by phase token. Classes: `.wf`, `.wf-row` (grid `88px 1fr 64px`), `.wf-track`, `.wf-bar` (absolute, `left`/`width` %), `.wf-row .ms` (tabular-nums), `.wf-legend` + `.sw2`. Phase colors: `--lok-phase-dns/connect/tls/ttfb/download`. Bars fill left-to-right on arrival (`--lok-dur-slower`) — reduced-motion gate applies. A11y: each row is `DNS 11 ms` as accessible text (label + ms are real text, not just bar width).

**`response/VerboseLog.tsx`** — `{ verboseLog: string }`. Responsibility: render `ResponseData.verbose_log` verbatim (already redacted by Rust) in the `.curl-log` style — colorize `>` (`--lok-status-info`), `<` (`--lok-heat-400`), `*` (`--lok-text-tertiary`), redacted `••••` (`--lok-text-disabled`) via a tiny line tokenizer. Read-only, `.lok-selectable`, copy button.

---

## 2. State model

Three durable zustand stores already exist and are **reused as-is** (no schema change needed for this feature):

| Store | Owns (relevant to workbench) | Workbench interaction |
|---|---|---|
| `useCollectionsStore` | `collections`, `requests: StoredRequest[]`, `activeRequestId`, `selectRequest`, `activeRequest()` | **Read** the active `StoredRequest` (seed for the draft). On save/persist, `upsert_request` writes back (persistence is a later milestone; v1 keeps edits in the draft + optionally patches the in-memory `requests` list). Selecting a different request **re-seeds** the draft. |
| `useEnvStore` | `activeEnvironmentId`, `activeEnvironment()`, `activeKind()` | **Read** `activeEnvironmentId` — passed as `environmentId` to `resolve_and_send` / `resolve_preview_curl`. |
| `useUiStore` | `responsePlacement`, `responseSize`, `theme`, palette | **Read** for the dock layout; no writes from the workbench. |

**The live, per-edit request state is NOT a global store** — it is a local hook, `useRequestDraft`, scoped to the mounted `RequestWorkbench`. Rationale: the draft changes on every keystroke, is specific to the currently-open request, and must not pollute the persisted `requests` list until the user saves. This mirrors the repo rule "logic in hooks, single-responsibility."

### 2.1 `useRequestDraft` (new — `src/hooks/useRequestDraft.ts`)

A `useReducer`-backed draft whose **shape is exactly `StoredRequest`** (so mapping to the IPC payload is the identity function, §3.1). The reducer:

```ts
// draft shape === StoredRequest (from src/lib/types.ts). No new fields.
type RequestDraft = StoredRequest;

type DraftAction =
  | { kind: "seed"; request: StoredRequest }            // select a new request → reset
  | { kind: "setMethod"; method: string }
  | { kind: "setUrl"; url: string }                     // triggers Params←URL parse
  | { kind: "setParams"; params: KeyValue[] }           // triggers URL←Params rebuild
  | { kind: "setHeaders"; headers: KeyValue[] }
  | { kind: "setBody"; body: Body }
  | { kind: "setAuth"; auth: Auth }
  | { kind: "importSpec"; spec: RequestSpec };          // from_curl → merge onto draft

interface DraftApi {
  draft: RequestDraft;
  dispatch: React.Dispatch<DraftAction>;
  // derived selectors
  counts: { params: number; headers: number; body: number; auth: number };
}

export function useRequestDraft(seed: StoredRequest | null): DraftApi;
```

Responsibilities held **inside the hook** (never in view components):
- **Seed / reset** when `seed.id` changes (`useEffect` dispatches `seed`).
- **Params ↔ URL two-way sync** (§2.2).
- **Body-mode transitions** (§2.3) that preserve text across `raw` variants.
- **`importSpec`** maps a `RequestSpec` (from `from_curl`) onto the draft (§2.4).
- Derived `counts` for the tab chips (count only `enabled` KVs; body count = 1 when non-`none`; auth count = 1 when non-`none`).

### 2.2 Params ↔ URL sync (the one tricky bit)

Single source of truth in the draft is **both** `url` (with its query string) **and** `query_params`. Keep them consistent:
- `setUrl`: parse the query string out of the new URL → replace `query_params` (preserve each param's `enabled` flag by name where it already existed; new params default `enabled: true`). Keep the URL string as authored (do not re-encode the path).
- `setParams`: rebuild the query portion of `url` from the enabled `query_params`, leaving scheme/host/path/`{{templates}}` untouched.
- **Guard against loops:** the reducer computes the *other* side from the *changed* side only; it never re-fires the opposite action. A small pure helper pair in `src/lib/urlParams.ts` (new): `parseQuery(url) → KeyValue[]` and `buildUrl(baseUrl, params) → string`, both `{{var}}`-safe (they must not choke on or encode template tokens — treat `{{...}}` as opaque). Unit-tested in isolation (§5).

> **Backend parity note:** the Rust `resolve.rs` folds `query_params` into the URL itself and then sends `query_params: []`. That happens **server-side at resolve time** — the FE still sends the structured `query_params` in the `StoredRequest` (Rust does the folding). So the FE keeps both `url` (human-authored, may contain a query) and `query_params`; do **not** pre-fold on the FE. To avoid double-counting, treat the URL's own query string as the params list (parse-on-load), so a param is represented once.

### 2.3 Body-mode transitions
`BodyModeSelect` dispatches `setBody` with a new `Body`:
- `none` → `{ type: "none" }`.
- `raw-json` → `{ type: "raw", content_type: "application/json", text }` (carry text from a previous `raw`).
- `raw-xml` → `{ type: "raw", content_type: "application/xml", text }`.
- `raw-text` → `{ type: "raw", content_type: "text/plain", text }`.
- `form` → `{ type: "form_urlencoded", fields }` (carry from a previous form; else empty).
- `multipart` → `{ type: "multipart", parts }`.
Text is preserved across the three `raw-*` variants (only `content_type` flips); switching to/from `form`/`multipart`/`none` starts that variant fresh (but the hook may cache the last `raw` text so toggling back restores it).

### 2.4 `importSpec` mapping (from_curl → draft)
`RequestSpec` has no `collection_id`/`name`/`sort_order`/`docs_md`/`graphql`. Map the overlapping fields onto the current draft and keep the draft's identity fields:
`method, url, headers, body, auth, options` ← spec; `query_params` ← re-parse from `spec.url` (curl bakes the query into the URL); `id, collection_id, name, sort_order, docs_md, graphql` ← keep from current draft.

### 2.5 `useSendRequest` (new — `src/hooks/useSendRequest.ts`)
Owns the request lifecycle state machine and the IPC calls (§3). Returns:
```ts
type SendPhase = "idle" | "interpolating" | "in-flight" | "success" | "error" | "canceled";
interface SendState { phase: SendPhase; response: ResponseData | null; error: string | null; }
interface UseSendRequest {
  sendState: SendState;
  send: (draft: StoredRequest, environmentId: string | null) => Promise<void>;
  cancel: () => void;   // uses the last-sent request id
}
```
Keeps the in-flight `requestId` in a ref so `cancel()` can call `cancel_request`. On new `send`, resets to `interpolating` synchronously, then `in-flight` once the promise is pending (there is no separate "interpolating" IPC — interpolation happens inside `resolve_and_send`; expose it as a brief UI phase for the animated button).

---

## 3. IPC wiring (exact)

All calls go through **typed wrappers in `src/lib/ipc.ts`** (already present). Tauri deserializes invoke args **by name**, mapping JS camelCase to Rust snake_case: `environmentId` → `environment_id`, `requestId` → `request_id`. These wrappers already exist and MUST be reused; do not `invoke` inline.

**Missing wrappers to ADD to `src/lib/ipc.ts`** (the two resolve commands are registered in `lib.rs` but not yet wrapped):
```ts
// resolve.rs — resolve_and_send(request: StoredRequest, environment_id: Option<String>) -> ResponseData
export function resolveAndSend(
  request: StoredRequest,
  environmentId: string | null,
): Promise<ResponseData> {
  return invoke("resolve_and_send", { request, environmentId });
}

// resolve.rs — resolve_preview_curl(request: StoredRequest, environment_id: Option<String>) -> String (REDACTED)
export function resolvePreviewCurl(
  request: StoredRequest,
  environmentId: string | null,
): Promise<string> {
  return invoke("resolve_preview_curl", { request, environmentId });
}
```
`cancelRequest(requestId)` and `fromCurl(command)` wrappers already exist and are reused. `toCurl` exists but **must NOT be used for the preview** — see §3.3.

### 3.1 Send
```
draft (RequestDraft === StoredRequest)
  → resolveAndSend(draft, useEnvStore.activeEnvironmentId)     // invoke resolve_and_send { request, environmentId }
  → Promise<ResponseData>
```
The draft is passed **verbatim** as `request` (it already is a `StoredRequest`). `environmentId` is the active env id (or `null` → Rust treats as no env, empty var map). Resolution (env flatten, secret fetch from Keychain, interpolation, SigV4) all happen in Rust; the FE sends the templated request untouched.

### 3.2 Cancel
```
cancel() → cancelRequest(lastSentRequestId)                    // invoke cancel_request { requestId }
```
`lastSentRequestId` = the draft's `id` used for the in-flight send (kept in a ref). `cancel_request` returns `bool` (true if a running request was found). Set `phase = "canceled"` regardless; ignore a `false` (already finished).

### 3.3 cURL preview (redacted — SECURITY-CRITICAL)
```
storedRequestFromDraft
  → resolvePreviewCurl(draft, environmentId)                  // invoke resolve_preview_curl { request, environmentId }
  → Promise<string>  (secrets already replaced with "•••" by Rust)
```
**Explicit rule:** the FE **never** calls `to_curl` to build the preview, and never sends real secret values anywhere for preview purposes. `resolve_preview_curl` builds a redacted spec in Rust (`build_render_ctx(..., redact=true)` — the Keychain is never read) and defers to `curlgen::to_curl(spec, redact=true)`. The only place `to_curl` might legitimately be called is a future explicit "copy real curl" action gated behind a warning — **out of scope here.**

### 3.4 Response mapping (`ResponseData` → UI)
| UI element | Source field(s) | Transform |
|---|---|---|
| `StatusBadge` code + color | `status`, `http_version` | `status` verbatim; color by class (2xx/3xx/4xx/5xx/1xx); reason via `statusText()` map |
| `ResponseMeta` Time | `timings.total_ms` | `round → "148 ms"` (tabular-nums) |
| `ResponseMeta` Size | `size_download_bytes` | `humanBytes()` → "1.24 KB" |
| `ResponseMeta` TLS | `tls?.protocol` | e.g. "1.3"; hide row if `tls == null` |
| `ResponseBody` | `body`, `body_is_base64`, `body_truncated_at` | JSON pretty via CodeMirror if JSON content-type; base64 → binary affordance; banner if truncated |
| `ResponseHeaders` | `headers: KeyValue[]` | read-only list; count → tab chip |
| `TimelineWaterfall` | `timings` | **see below** |
| `VerboseLog` | `verbose_log` | render verbatim (already redacted), line-tokenized colors |
| status strip (existing `StatusBar`) | `status`, `timings.total_ms`, `size_download_bytes`, `http_version`, `tls` | mono, tabular-nums summary line |

**Waterfall percentage math** — libcurl timings in `Timings` are **cumulative from start** (`dns_ms ≤ connect_ms ≤ tls_ms ≤ ttfb_ms ≤ total_ms`). Convert to per-phase spans, then to `% of total_ms`:
```
dns      = dns_ms                       // 0 → dns_ms
connect  = connect_ms - dns_ms          // TCP after DNS
tls      = tls_ms - connect_ms          // handshake after connect
ttfb     = ttfb_ms - tls_ms             // wait for first byte
download = total_ms - ttfb_ms           // content download
// each bar: left = (cumulativeStart / total_ms) * 100 ; width = (phaseDur / total_ms) * 100
// guard total_ms <= 0 → render zero-width bars; clamp negatives to 0 (out-of-order data)
```
This helper (`phaseSpans(timings)`) lives in `src/lib/waterfall.ts` (new), pure + unit-tested (§5). The bar colors map 1:1 to `--lok-phase-*`.

### 3.5 Error & lifecycle states
`resolve_and_send` returns `Result<ResponseData, String>`; a rejected invoke throws the `String`. Classify in `useSendRequest`:
- **network / DNS / connection refused** → `phase="error"`, `error` = message; dock shows red error banner. (Rust engine surfaces libcurl errors as strings.)
- **timeout** → same `error` path; message contains "timeout"/"timed out"; the banner can hint at `options.timeout_ms`.
- **interpolation error** (unknown `{{env.x}}` / `{{secret.x}}`) → `resolve_and_send` errors **before** any network call (per `resolve.rs` tests); `phase="error"`, message names the missing variable — surface it clearly (this is a common authoring mistake).
- **canceled** → user hit Cancel; `phase="canceled"`, neutral banner, no error styling.
- **success** → `phase="success"`, `response` set, dock rises.

State map that drives the UI:
```
idle ──send──► interpolating ──(promise pending)──► in-flight ──resolve──► success
                                                        │                └► error
                                                        └──cancel──► canceled
(any terminal state) ──send again──► interpolating …
```
The animated Send button reads `phase ∈ {interpolating, in-flight}` → busy/cancel; everything else → normal Send. Empty URL → `disabled`.

---

## 4. Cross-cutting rules (applied to every component)

- **Shell:** the workbench never grows the window. `.editor`, `.response`, `.pane`, `.resp-body`, `.tree` use `min-height:0` + `overflow:auto` (`.lok-scroll`) so only they scroll. `100dvh` grid is owned by `AppShell` (unchanged).
- **A11y:**
  - Every icon-only button (`+`, remove `✕`, copy, cancel) has an `aria-label`.
  - Method/status/env are **never color-only** — always paired with a text label (design-system §6).
  - `focus-visible` heat ring comes free from `base.css`; do not remove outlines without it.
  - Tabs: `role="tablist"`/`role="tab"`/`aria-selected`, arrow-key movement; panels `role="tabpanel"` + `aria-labelledby`.
  - `StatusBadge` and import-error regions use `aria-live="polite"`.
  - Contrast: use only semantic tokens (already AA/AAA verified); never hardcode a hex.
- **Reduced motion:** all the "wow" motion (Send scale/glow, dock `dock-rise`, status `pop`, waterfall fill) is CSS animation/transition → the `base.css` hard gate collapses it to `0.01ms`. Do not add JS-driven motion that bypasses the gate; if using `motion` (a dep), read `useReducedMotion()` and skip.
- **Tabular numbers:** status code, `ms`, sizes, and every waterfall `.ms` use `.lok-tnums`/`tabular-nums` (design-system §6). Formatting helpers centralize this so numbers never jitter.
- **Icons:** one `IconSprite` mounted once; `Icon` component references `#i-*`. No emoji-as-icon (replace the placeholder `⚡` in the old SendButton with `#i-send`/`#i-flame`).
- **No hardcoded strings in styling:** consume `--lok-*` tokens only (MASTER.md rule). Reuse the existing `style.css` class names where the mock already defines them, or Tailwind utilities + inline token vars as the current components do.
- **File size / structure:** keep each view < ~100 lines; push branching/derivation into hooks and `src/lib/*` pure helpers.

New pure helpers (all unit-tested, no React/Tauri): `src/lib/urlParams.ts`, `src/lib/waterfall.ts`, `src/lib/format.ts` (bytes/ms), `src/lib/httpStatus.ts` (`statusText`, status class → token).

---

## 5. Test plan (Vitest + React Testing Library)

Mock the Tauri boundary: `vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`. The existing `src/test/setup.ts` (ResizeObserver + scrollIntoView stubs) covers CodeMirror/cmdk needs. Assert on **invoke command name + payload shape**, not internals.

### 5.1 Pure-helper unit tests (fast, no DOM)
- **`urlParams.test.ts`** — `parseQuery`/`buildUrl`: round-trip `?a=1&b=2`; `{{env.x}}` template tokens survive un-encoded; percent-encoding of literal values; empty query; preserving `enabled` by name.
- **`waterfall.test.ts`** — `phaseSpans`: cumulative → per-phase spans; percentages sum ≈ 100; `total_ms=0` → zero widths (no NaN/Infinity); out-of-order timings clamp to ≥ 0.
- **`format.test.ts`** — `humanBytes` (B/KB/MB), `ms` rounding.
- **`httpStatus.test.ts`** — status → reason + class/token (200→success, 404→warn, 500→danger, 0/1xx→neutral).

### 5.2 `useRequestDraft` (hook) tests
- **Params → URL:** dispatch `setParams([{name:"q",value:"a",enabled:true}])` on base URL `https://api/x` → draft.url becomes `https://api/x?q=a`.
- **URL → Params:** dispatch `setUrl("https://api/x?limit=25")` → `query_params` contains `{name:"limit",value:"25",enabled:true}`; no loop / stable after a second identical dispatch.
- **Body mode switching:** `raw-json` → `raw-xml` preserves `text`, flips `content_type`; `none`→`form` yields `{type:"form_urlencoded",fields:[]}`; toggling back to `raw` restores cached text.
- **`importSpec`:** given a `RequestSpec`, draft keeps `id/collection_id/name` and takes `method/url/headers/body/auth/options`; `query_params` re-parsed from spec url.
- **Draft shape === StoredRequest:** a freshly-seeded draft deep-equals the seed `StoredRequest` (the mapping to the IPC payload is identity).

### 5.3 `useSendRequest` + Send/cancel wiring
- **Send calls `resolve_and_send` with the exact payload:** `invoke` called once with `("resolve_and_send", { request: <draft>, environmentId: <activeEnvId> })`; `request` deep-equals the draft; `environmentId` matches the active env store value (and `null` when none). Phase transitions `idle→…→success`; `response` set.
- **Preview calls `resolve_preview_curl`, NOT `to_curl`:** opening the cURL tab invokes `("resolve_preview_curl", { request, environmentId })`; assert `invoke` was **never** called with `"to_curl"` (secret-leak guard).
- **from_curl import:** paste + Import invokes `("from_curl", { command })`; returned spec is merged (assert draft update).
- **Error state:** `invoke` rejects with `"could not resolve host"` → `phase="error"`, dock renders the message with danger styling; no crash.
- **Interpolation error before network:** `invoke` rejects with `"unknown variable: host"` → `phase="error"`, message names the variable.
- **Cancel:** while in-flight, cancel invokes `("cancel_request", { requestId: <draft.id> })`; `phase="canceled"`.

### 5.4 Component render tests (RTL)
- **200 → waterfall %:** render `ResponseDock` (or `TimelineWaterfall`) with a `ResponseData` (status 200, sample cumulative `timings`) → 5 bars present with `width` percentages matching `phaseSpans` (assert on inline `style.width` or a data attribute), `.ms` cells show tabular numbers, phase legend present.
- **StatusBadge color by class:** 200 → success token, 404 → warn, 500 → danger; reason label rendered (not color-only).
- **KeyValueTable enable/disable:** toggling the checkbox flips `enabled` in the emitted rows; remove button drops the row; ghost row appends on first edit.
- **A11y smoke:** icon-only buttons expose an accessible name (`getByRole("button", { name })`); tabs expose `role="tab"` + `aria-selected`.
- **Send disabled when URL empty:** SendButton is `disabled`; becomes enabled once a URL is present.

---

## 6. Execution order for the coding agent

1. Pure helpers + their tests (`urlParams`, `waterfall`, `format`, `httpStatus`) — no UI risk, fast feedback.
2. Add the two IPC wrappers (`resolveAndSend`, `resolvePreviewCurl`) to `src/lib/ipc.ts`.
3. `useRequestDraft` + tests; `useSendRequest` + tests.
4. Shared `Icon`/`IconSprite` + `KeyValueTable`.
5. Zone 2: `RequestBar` (MethodSelect/UrlInput/SendButton) → `RequestTabs` → panels (Params/Headers/Body/Auth/cURL). Wire `RequestWorkbench`.
6. Zone 3: `ResponseDock` (StatusBadge/ResponseMeta/ResponseBody/ResponseHeaders/TimelineWaterfall/VerboseLog).
7. Swap the placeholders in `RequestEditor`/`ResponseDock`/`SendButton`/`RequestToolbar` for the workbench components (or retire them).
8. `yarn typecheck` + `yarn test:unit` green; visual parity check against `mock-request.html` (both themes) before PR.

**Definition of done:** typecheck clean, unit tests green, no scrollable window, Send hits `resolve_and_send` with the draft, cURL preview hits `resolve_preview_curl` (never `to_curl`), waterfall proportional, reduced-motion + a11y satisfied, visual match to the mock.
