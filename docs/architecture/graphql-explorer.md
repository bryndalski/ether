# GraphQL Explorer — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + `graphql` (graphql-js 17) + `cm6-graphql` + `@uiw/react-codemirror` (all already in `package.json`) + design-system v2 (`--lok-*` tokens).
> **Visual pattern (1:1):** `design-system/preview/mock-graphql.html` + `design-system/preview/style.css`. Every class name / token below is drawn from those files and `src/styles/tokens.css`. **Never invent a class/token.**
> **Contract source of truth:** `src-tauri/src/models.rs` (`StoredRequest.graphql: Option<GraphqlMeta>` with `operation_type` / `query` / `variables_json`), mirrored 1:1 in `src/lib/types.ts` (`GraphqlMeta`, `StoredRequest.graphql`). **Never invent a field.**
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered commands) + `src/lib/ipc.ts` (typed wrappers). **All commands this feature needs already exist and are already wrapped** — `resolveAndSend`, `resolvePreviewCurl`, `gqlSchemaGet(endpointUrl)`, `gqlSchemaPut(endpointUrl, introspectionJson)`, `upsertRequest`, `cancelRequest`. **No new Rust command and no new IPC wrapper are required.**

The GraphQL Explorer is a **third editor mode for the Request Workbench**. When a `StoredRequest` has `graphql != null` it is a GraphQL request and Zone 2 renders the **Explorer** (op-picker + field tree + query editor + docs explorer + variables/headers) instead of the plain REST editor. Everything Feature 1 built is **reused, not replaced**: `useRequestDraft` (draft === `StoredRequest`), `useSendRequest` (the `resolve_and_send` lifecycle + cancel), `ResponseDock` (Zone 3), `RequestBar`'s method/URL row, `KeyValueTable`, `Icon`/`IconSprite`, and the whole env/secrets stack from Feature 2. **This feature adds no send path of its own** — it builds a `StoredRequest` (POST, raw JSON body `{query, variables}`) and hands it to the exact same `resolve_and_send`, so `{{env.x}}` interpolation, SigV4, and Keychain secrets all work inside a GraphQL query for free (our differentiator).

Hard rules that govern everything below (`design-system/MASTER.md` §6, repo feedback):
- **1 component = 1 file.** All logic in hooks (`src/hooks/*`) or pure helpers (`src/lib/*`); view files stay small (< ~100 lines) and dumb. Types at module scope.
- **Shell:** `100dvh`, **no scrollable window** — only inner panes (`.col-body`, `.query-pane`, `.vars-body`) scroll via `.lok-scroll` (`min-height:0` + `overflow:auto`). The mock's grid is `grid-template-rows: titlebar toolbar 1fr statusbar` — the `1fr` row owns the 3-column body; the window never grows.
- **A11y non-negotiable:** the field tree is a real `role="tree"`/`treeitem`/`group` with `aria-expanded`; `focus-visible` heat ring (free from `base.css`); `aria-*` on every icon-only button; AA/AAA contrast via **semantic tokens only** (never a raw hex); `prefers-reduced-motion` hard gate (free from `base.css`).
- **Never color-only:** the op-type (query/mutation/subscription), schema health, and secret status all pair color with a text label + Lucide icon (`common/Icon` sprite; no CDN, no emoji-as-icon).
- **Secrets never leave Rust.** Introspection and every send go through `resolve_and_send` (Rust does env flatten + Keychain fetch + interpolation). The FE never holds a secret value and never builds the auth header itself — it passes the templated `StoredRequest` and lets Rust resolve `{{secret.NAME}}`.
- **`graphql` (graphql-js) is a pure library** — parsing/printing/introspection/AST work is all synchronous JS with **no** network of its own. All I/O is one of the four IPC calls above.

---

## 0. What already exists (do not rebuild)

| Piece | State | This feature |
|---|---|---|
| `GraphqlMeta` (Rust + `types.ts`) | `{ operation_type, query, variables_json }` on `StoredRequest.graphql` | **The persistence shape.** No schema change. |
| `resolveAndSend(request, environmentId)` | wrapped in `ipc.ts` | **Reused verbatim** for introspection AND for running operations. |
| `resolvePreviewCurl(request, environmentId)` | wrapped in `ipc.ts` | Reused for a redacted cURL view of the GraphQL POST (optional tab). |
| `gqlSchemaGet(endpointUrl)` → `string \| null` | wrapped in `ipc.ts`; SQLite table `gql_schema_cache` keyed by `endpoint_url` | **Read** the cached raw introspection JSON on open. |
| `gqlSchemaPut(endpointUrl, introspectionJson)` | wrapped in `ipc.ts` | **Write** the raw introspection JSON after a successful introspection. |
| `useRequestDraft(seed)` | draft === `StoredRequest`; `dispatch` + `counts` | Reused; the Explorer dispatches `setUrl`/`setHeaders`/`setBody` and a **new** `setGraphql` action (§4.1). |
| `useSendRequest()` | `sendState` / `send(draft, envId)` / `cancel()` | Reused verbatim for **Run** (§3). |
| `ResponseDock` (Zone 3) | status/meta/body/headers/timeline/verbose | Reused verbatim to show the GraphQL response (§3.3). |
| `KeyValueTable`, `Icon`, `IconSprite`, `EnvPill`, `useEnvStore.activeEnvironmentId` | present | Reused (Headers panel = `KeyValueTable`; op-select/refresh icons = `Icon`). |
| `useCollectionsStore.activeRequest()` / `selectRequest` / `saveRequest` (Feature 2) | present | The load/save channel — a GraphQL request is just a `StoredRequest` with `graphql != null`. |

**The only Rust-side thing missing is nothing** — introspection is deliberately done **without a new command** (§1). The FE builds the introspection query with `graphql`'s `getIntrospectionQuery()` and sends it through `resolve_and_send`.

---

## 1. Introspection (no new Rust command)

The whole point: **the schema is fetched the same way any request is sent** — through `resolve_and_send` — so it inherits the active request's URL, headers, auth, and the active environment's vars/secrets. A GraphQL API that needs a Bearer token to introspect works because introspection carries the same auth as the operation.

### 1.1 The introspection request (built entirely on the FE, sent via `resolve_and_send`)

```
buildIntrospectionRequest(draft, endpointUrl):
  query   = getIntrospectionQuery()            // from "graphql" — a plain string
  body    = { type: "raw",
              content_type: "application/json",
              text: JSON.stringify({ query }) } // NO variables for introspection
  request : StoredRequest = {
    ...draft,                                   // ← inherits id/collection_id/name/options
    method: "POST",
    url:    endpointUrl,                        // draft.url (may contain {{env.host}})
    headers: draft.headers,                     // ← SAME headers as the operation
    query_params: [],
    body,
    auth:   draft.auth,                         // ← SAME auth (bearer/apikey/sigv4/{{secret}})
    graphql: null,                              // introspection is a plain POST, not "an operation"
  }
  → resolveAndSend(request, useEnvStore.activeEnvironmentId)
```

**Introspection MUST go with auth — this is the key point.** Because we clone `draft.headers` and `draft.auth` onto the introspection request and send it through `resolve_and_send`, Rust performs the identical env-flatten → Keychain-fetch → `{{...}}` interpolation → SigV4 signing it does for a normal send. So `Authorization: Bearer {{secret.API_TOKEN}}` (or a SigV4 profile, or an `X-Api-Key: {{env.key}}` header) is present on the introspection POST exactly as it would be on the operation. There is **no** separate "introspect anonymously" path and no place where the FE assembles the auth header itself.

### 1.2 Parse → client schema

```
resp = ResponseData           // from resolve_and_send
introspection = JSON.parse(resp.body).data          // the __schema payload
schema = buildClientSchema(introspection)           // "graphql" — GraphQLSchema for cm6-graphql/docs/tree
rawJson = JSON.stringify({ data: introspection })   // canonical cache form
```
Errors to surface distinctly (§1.5): non-2xx status; `resp.body` not JSON; `JSON.parse(resp.body).errors` present (introspection disabled → often `errors: [...]`); `buildClientSchema` throws (malformed shape).

### 1.3 Cache: `gql_schema_put` / `gql_schema_get` (keyed by endpoint URL)

- **On successful introspection:** `gqlSchemaPut(endpointUrl, rawJson)` persists the raw introspection JSON in the SQLite `gql_schema_cache` (upsert on `endpoint_url`, `fetched_at` bumped by Rust).
- **On Explorer open:** `gqlSchemaGet(endpointUrl)` → if it returns a string, `buildClientSchema(JSON.parse(str).data)` **without a network round-trip** → instant `ready`. If it returns `null`, state is `no-schema` (offer an introspect action, or auto-introspect once — see §1.4).
- **Cache key = `endpointUrl` = the *stored/templated* URL** (e.g. `https://api.duotio.com/graphql`, or a raw `{{env.host}}/graphql`). Rationale: the cache key must be **stable across env switches and app restarts** and must not require resolving secrets just to look up a schema. Consequence to document for the user: two environments that share the same templated URL string share a cached schema (correct — same endpoint text); a templated URL like `{{env.host}}/graphql` caches under that literal template (also stable). **Do not** resolve the URL on the FE to key the cache (we don't have the resolved value; resolution lives in Rust). Store the schema under `draft.url` verbatim.

### 1.4 "Refresh schema" = re-introspect

The `RefreshSchemaButton` (`.btn.refresh` in the mock, `#i-refresh`) always **re-runs §1.1–1.3**: build introspection request → `resolve_and_send` → parse → `buildClientSchema` → `gql_schema_put` (overwrite) → statusbar "last refresh just now". On open with a cache hit we render immediately AND may kick a background refresh only if the user opts in (default: cache-first, manual refresh — cheaper, offline-friendly). While refreshing, state is `introspecting` (button shows a spinning `#i-refresh`, `aria-busy`).

### 1.5 SDL fallback (introspection disabled / errored)

When introspection is turned off (common in production) or any step in §1.2 fails, drop to **`sdl-fallback`**: a panel to paste a schema in SDL. `buildSchema(sdlText)` (from `graphql`) yields the same `GraphQLSchema` the rest of the UI consumes — cm6-graphql, the field tree, and the docs explorer are **schema-source-agnostic**. The pasted SDL is cached too, wrapped as a sentinel so `gql_schema_get` can distinguish it on reload:
```
rawJson = JSON.stringify({ __lok_sdl: sdlText })    // sentinel — not an introspection payload
gqlSchemaPut(endpointUrl, rawJson)
// on load: parsed = JSON.parse(cached); if (parsed.__lok_sdl) schema = buildSchema(parsed.__lok_sdl)
//                                       else                   schema = buildClientSchema(parsed.data)
```
Inline `buildSchema` parse errors are shown with line/message (from the `GraphQLError` thrown), `aria-live="polite"`.

### 1.6 State machine (`useGraphqlSchema` hook, §4.2)

```
                 gqlSchemaGet(url)
        ┌────────── hit ──────────► ready
open ──►│                                   ▲   ▲
        └── miss ► no-schema                │   │
                       │  introspect        │   │ buildClientSchema OK
                       ▼                     │   │
                 introspecting ──resolve──►──┘   │
                       │  status!=2xx / not JSON │
                       │  / errors[] / build throw
                       ▼                          │
                    error ── "paste SDL" ──► sdl-fallback ──buildSchema OK──►┘
                       ▲                          │  buildSchema throws
                       └──────────────────────────┘
Refresh schema (any state) ──► introspecting ──► ready | error
```
`SchemaState = "no-schema" | "introspecting" | "ready" | "error" | "sdl-fallback"`. `ready` always carries a `GraphQLSchema`; `error` carries a classified message; `sdl-fallback` carries the current SDL text + optional parse error.

---

## 2. Components (1 file/component, logic in hooks)

Directory: `src/components/graphql/` (new), reusing `src/components/common/*`, `src/components/workbench/KeyValueTable`, `src/components/response/ResponseDock`, and the existing topbar/statusbar. Each row = one file. Layout mirrors the mock's `.app` grid and `.cols` 3-column body (`280px 1fr 260px`).

```
workbench/RequestWorkbench           (existing — now branches on draft.graphql, §4.4)
│   if draft.graphql != null → GraphqlExplorer ; else → REST editor (Feature 1)
│
└── graphql/GraphqlExplorer          (container; owns useGraphqlSchema + useGraphqlBuilder; lays out the mock grid)
    ├── graphql/ExplorerToolbar       (.toolbar row: OperationPicker + UrlInput(reused) + RefreshSchemaButton + RunButton)
    │   ├── graphql/OperationPicker    (.op-select — query | mutation | subscription)
    │   ├── workbench/UrlInput          (REUSED — mono URL field, {{var}} highlight; drives endpointUrl)
    │   ├── graphql/RefreshSchemaButton (.btn.refresh + #i-refresh; spins while introspecting)
    │   └── graphql/RunButton           (.btn-send heat gradient + #i-play; reuses SendButton states)
    │
    ├── graphql/FieldTree              (.col.tree-col — recursive checkbox tree; role="tree")
    │   ├── graphql/FieldTreeNode       (.f row: chevron + checkbox + fname + ftype; role="treeitem")
    │   └── graphql/FieldArgsPopover    (args editor for a selected field with arguments)
    │
    ├── graphql/QueryEditor            (.col.mid → .query-pane — CodeMirror + cm6-graphql(schema))
    │   └── graphql/OperationVarsPanel  (.vars-pane — VariablesPanel / HeadersPanel tab strip)
    │       ├── graphql/VariablesPanel   (JSON editor — CodeMirror lang-json over variables_json)
    │       └── graphql/HeadersPanel     (REUSES workbench/KeyValueTable over draft.headers)
    │
    ├── graphql/DocsExplorer           (.col.docs-col — type drill-down; Cmd-click a type)
    │   ├── graphql/DocsTypePanel        (.doc-type + fields of the current type)
    │   └── graphql/DocsBreadcrumb       (navigation stack: Query › User › Role)
    │
    └── graphql/ExplorerStatusBar      (.statusbar — "schema introspected · N types", "query · K fields selected", last refresh)
```

Zone 3 response is **not redrawn** — `RequestWorkbench` continues to render the existing `response/ResponseDock` below/beside the Explorer, fed by the shared `useSendRequest().sendState` (§3.3).

### 2.1 Per-component spec

Legend — **file** · **props** · **responsibility** · **classes/tokens** (from `style.css` / `mock-graphql.html`).

**`graphql/GraphqlExplorer.tsx`** — `{ draft: RequestDraft; dispatch: DraftDispatch; sendState: SendState; onRun: () => void; onCancel: () => void }`. Responsibility: instantiate `useGraphqlSchema(draft)` and `useGraphqlBuilder(draft, schema, dispatch)`; lay out the mock grid (`.app` rows already owned by `AppShell`; this fills the `1fr` body with `.cols` `grid-template-columns:280px 1fr 260px`). Renders `ExplorerToolbar` → (`FieldTree` | `QueryEditor`+`OperationVarsPanel` | `DocsExplorer`) → `ExplorerStatusBar`. Passes the resolved `GraphQLSchema` down (or the `SchemaState` for the tree/editor to render their loading/empty/error affordances). No business logic in the view — all of it is in the two hooks.

**`graphql/ExplorerToolbar.tsx`** — `{ opType; onOpType; url; onUrl; schemaState; onRefresh; runState; onRun; onCancel }`. The `.toolbar` (`height:var(--lok-toolbar-h)`, `border-bottom:1px solid var(--lok-border-subtle)`, `background:var(--lok-bg-surface)`). Composes `OperationPicker` + `UrlInput` + `RefreshSchemaButton` + `RunButton`.

**`graphql/OperationPicker.tsx`** — `{ opType: OperationType; onChange: (t) => void; available: OperationType[] }` (`OperationType = "query" | "mutation" | "subscription"`). The `.op-select` (`.op` label tinted `--lok-syn-gql`, chevron `#i-chev`). **Native `<select>` preferred** for a11y/keyboard. `available` is derived from the schema (`schema.getMutationType()`/`getSubscriptionType()` may be null → those options disabled with a title "Schema has no mutations"). Changing op-type dispatches `setGraphql({ operation_type })` and re-roots the field tree to the matching root type (§4.3). **Never color-only:** the op label is text.

**`graphql/UrlInput.tsx`** — REUSED from `workbench/`. Drives `endpointUrl` (= `draft.url`). `{{var}}` template tokens render in `--lok-heat-300`. Its `onChange` dispatches `setUrl`; changing the endpoint **invalidates the schema** (re-key the cache lookup, §1.3) — `useGraphqlSchema` re-runs `gqlSchemaGet(newUrl)`.

**`graphql/RefreshSchemaButton.tsx`** — `{ state: SchemaState; onRefresh: () => void }`. `.btn.refresh` + `Icon name="i-refresh"` + label "Refresh schema". While `introspecting`: add a spin class (reduced-motion gate stops the spin), `aria-busy={true}`, disabled. A11y: `aria-label="Odśwież schemat"`.

**`graphql/RunButton.tsx`** — thin wrapper over the existing `workbench/SendButton` behavior. `.btn-send` heat gradient + `Icon name="i-play"` + label "Run" + `⌘↵` hint. Reuses `SendState` phases (`interpolating`/`in-flight` → animated + Cancel; `idle`/`success`/`error` → Run; `disabled` when the URL is empty or the query is empty/unparseable). A11y: `aria-label` reflects state.

**`graphql/FieldTree.tsx`** — `{ schema: GraphQLSchema; rootType: GraphQLObjectType; selection: SelectionModel; onToggle: (path: FieldPath) => void; onEditArgs: (path, args) => void }`. Responsibility: the recursive **checkbox** field tree of the mock's `.col.tree-col`. Container is `role="tree"` `aria-label="Pola schematu"`; renders the root type header (`.f.field-type`, `#i-chev`) then its fields as `FieldTreeNode`s. Selecting a field toggles it into the operation (§4.3). Scroll via `.col-body`/`.lok-scroll`.

**`graphql/FieldTreeNode.tsx`** — `{ field: GraphQLField; path: FieldPath; depth: number; selected: boolean; expandable: boolean; expanded: boolean; hasArgs: boolean; onToggle; onExpand; onEditArgs }`. One `.f` row: optional chevron (`#i-chevr` collapsed / `#i-chev` expanded) for object/interface/union fields; `<input type=checkbox accent-color:var(--lok-heat-500)>`; `.fname` (`--lok-text-secondary`, `.f.on .fname → --lok-heat-300` when selected); `.ftype` (right-aligned `--lok-syn-gql`, shows `(args): Type` like the mock). Indent by `depth` (`.f.indent`/`.indent2` → deeper via `padding-left`). If `hasArgs`, a tiny args affordance opens `FieldArgsPopover`. **a11y:** `role="treeitem"`, `aria-expanded` (only when expandable), `aria-selected={selected}`, `aria-level={depth+1}`; the checkbox has `aria-label={"Zaznacz pole " + field.name}`. Children (when expanded) live in a nested `role="group"`. Expanding a field whose type is an object lazily renders its subfields (recursion; guard against infinite recursion on self-referential types with a visited-type-per-branch set — expansion is user-driven so this is naturally bounded, but the guard prevents a runaway auto-expand).

**`graphql/FieldArgsPopover.tsx`** — `{ field: GraphQLField; values: Record<string,string>; onCommit: (args) => void; onClose }`. A `--lok-bg-overlay` popover (`role="dialog"`) listing the field's `args` (name : type). Each arg gets a mono input; a value may be a literal or a `{{env.x}}`/`$var` reference. Committing writes the args into the selection model → the builder re-prints the query with `field(arg: value)` and, for `$var` references, adds the variable to the operation's variable definitions (§4.3). Optional in v1 (a field with required args can still be selected; the arg is emitted as a `$fieldArg` variable placeholder the user fills in `VariablesPanel`).

**`graphql/QueryEditor.tsx`** — `{ query: string; schema: GraphQLSchema | null; onChange: (text: string) => void }`. **The centerpiece.** `@uiw/react-codemirror` with the **`cm6-graphql`** extension `graphql(schema)` → autocomplete, lint (invalid fields/args underlined), and hover/type-info from the live schema. When `schema == null` (no-schema/error), fall back to `graphql()` with no schema arg (syntax-only, still parses). Dark theme via existing tokens (`--lok-bg-surface`, syntax `--lok-syn-*`, gql keyword `--lok-syn-gql`). `.query-pane`/`.lok-scroll`. `onChange` (debounced) dispatches `setGraphql({ query })` AND feeds the **edit→selection** side of the two-way sync (§4.3). A11y: labelled editor region; reduced-motion no-ops here.

**`graphql/OperationVarsPanel.tsx`** — `{ variablesJson; onVariablesChange; headers; onHeadersChange }`. The `.vars-pane` under the editor: a `.vars-tabs` strip (`Variables` | `Headers <count>`), rendering `VariablesPanel` or `HeadersPanel`. Active tab underline = heat. `role="tablist"`, arrow-key nav, `aria-selected`.

**`graphql/VariablesPanel.tsx`** — `{ value: string; onChange: (text: string) => void }`. CodeMirror `lang-json` over `graphql.variables_json`. A non-blocking JSON linter (`@codemirror/lint`) flags parse errors; Run is still allowed (Rust/endpoint validates). `.vars-body`/`.lok-scroll`. `{{env.x}}` inside a JSON string value is allowed and preserved (our interpolation, §3.4). A11y: labelled region.

**`graphql/HeadersPanel.tsx`** — `{ headers: KeyValue[]; onChange }` → **REUSES** `workbench/KeyValueTable` over `draft.headers` (the same headers introspection and Run both send). `.vars-body` wrapper. This is why a GraphQL request's `Authorization`/`X-Api-Key` header is edited in exactly one place and used for both schema fetch and operation.

**`graphql/DocsExplorer.tsx`** — `{ schema: GraphQLSchema; focus: TypeRef | null; onFocusType: (t) => void }`. The `.col.docs-col`. Shows the currently-focused type (`DocsTypePanel`) with a `DocsBreadcrumb` navigation stack. Opening the Explorer focuses the root `Query` type. **Cmd-click on any type name** (in the docs panel, or on a `.ftype` in the field tree, or on a type token in the editor via a cm6-graphql `jump-to-type` interaction) pushes that type onto the breadcrumb and focuses it. `.col-body`/`.lok-scroll`.

**`graphql/DocsTypePanel.tsx`** — `{ type: GraphQLNamedType }`. Renders `.doc-type` header (`type User`) + each field as `.doc-field` (`.name` `.n`=field `--lok-syn-key` : `.t`=type `--lok-syn-gql`, `.desc`=`field.description`). Type names inside `.t` are Cmd-clickable → `onFocusType`. Enums/inputs/scalars render their variant (values / input fields / scalar note). A11y: type-link tokens are `<button>`s or `role="link"` with keyboard access (Cmd/Ctrl+Enter mirrors Cmd-click; and plain Enter navigates since Cmd-click is pointer-only).

**`graphql/DocsBreadcrumb.tsx`** — `{ stack: TypeRef[]; onNavigate: (index) => void }`. A `Query › User › Role` trail; clicking an ancestor pops back to it. `.col-head`-style small caps.

**`graphql/ExplorerStatusBar.tsx`** — `{ schemaState; typeCount; opType; selectedFieldCount; lastRefreshLabel }`. The `.statusbar`: health dot (`.health .dot` success when `ready`, warn when `sdl-fallback`, danger when `error`) + "schema introspected · N types" (or "SDL schema · N types" / "no schema"); `.mono` "query · K fields selected"; `.mono` "last refresh 2 min ago". Tabular-nums on all counts. **Never color-only** — the dot is always paired with text.

---

## 3. Sending the operation (through the shared `resolve_and_send`)

**No new send path.** Run builds a `StoredRequest` and hands it to `useSendRequest().send(...)` exactly like the REST workbench does.

### 3.1 Build the operation request

```
buildOperationRequest(draft):
  vars = draft.graphql.variables_json            // stored as a STRING (may contain {{env.x}})
  bodyText = buildGraphqlBody(draft.graphql.query, vars)   // → {"query":"...","variables":{...}} as a STRING
  return {
    ...draft,
    method: "POST",
    body: { type: "raw", content_type: "application/json", text: bodyText },
    query_params: [],
    // url / headers / auth / options / graphql: unchanged from draft
  }
```
`buildGraphqlBody(query, variablesJson)` (pure helper, `src/lib/graphqlBody.ts`, §5.1): produces the canonical JSON envelope. It **must not** re-parse or reformat `variablesJson` in a way that eats `{{env.x}}` — it embeds the variables object as-is. Simplest robust form: `` `{"query":${JSON.stringify(query)},"variables":${variablesJson || "{}"}}` `` — `query` is safely JSON-encoded, and `variablesJson` is inlined verbatim so `{{env.x}}` survives into the raw body for Rust to interpolate. (Guard: if `variablesJson` is blank/whitespace, use `{}`.)

### 3.2 Run

```
RunButton → onRun()
  → send(buildOperationRequest(draft), useEnvStore.activeEnvironmentId)   // useSendRequest, resolve_and_send
```
Cancel, error classification, and the `interpolating → in-flight → success|error|canceled` machine are **inherited unchanged** from `useSendRequest`. GraphQL "errors" that come back with HTTP 200 (the spec's `{ "errors": [...] }`) are still a `success` transport-wise; the response body shows them — the `ResponseDock` renders the JSON as-is (a future enhancement could add a GraphQL-aware error badge, out of scope here).

### 3.3 Response viewer — reuse `ResponseDock`

The GraphQL response is a normal `ResponseData`; **reuse `response/ResponseDock` verbatim** (Zone 3). `RequestWorkbench` already mounts `ResponseDock` fed by the shared `sendState`, so the Explorer needs to do nothing except share that one `useSendRequest` instance. Body tab pretty-prints the JSON (CodeMirror `lang-json`), Headers/Timeline/Verbose all work as-is. No dedicated GraphQL response dock in v1.

### 3.4 `{{env.x}}` interpolation inside the query (our differentiator — call it out)

Because the query and variables are placed in a **raw JSON body** and shipped through `resolve_and_send`, **`{{env.x}}` / `{{secret.x}}` templates work *inside the GraphQL query string and inside variables*** — Rust interpolates the whole templated request before sending. Examples that "just work":
- `query { user(id: "{{env.testUserId}}") { name } }` — env value substituted in the query text.
- variables `{"token": "{{secret.API_TOKEN}}"}` — Keychain secret substituted into a variable value.
- `Authorization: Bearer {{secret.API_TOKEN}}` header — used for both introspection and Run.

This is a genuine advantage over browser-based GraphiQL/Apollo Sandbox (no env/secret layer) and it costs the FE nothing — do **not** interpolate on the FE (we can't read secrets; Rust owns it). The `graphql`-based query builder and cm6-graphql linter treat `{{...}}` as opaque string content (they only appear inside string literals), so autocomplete/lint are unaffected. **Document this prominently as the headline feature.**

---

## 4. State, persistence, and the two-way builder↔editor sync

### 4.1 New draft action: `setGraphql`

Extend `useRequestDraft`'s `DraftAction` (the only change to Feature 1's hook):
```ts
| { kind: "setGraphql"; graphql: Partial<GraphqlMeta> }   // shallow-merge onto draft.graphql
```
Reducer: `graphql: { ...(draft.graphql ?? EMPTY_GQL), ...action.graphql }` where `EMPTY_GQL = { operation_type: "query", query: "", variables_json: "{}" }`. All Explorer edits (op-type, query text, variables) flow through `setGraphql`; headers/url flow through the existing `setHeaders`/`setUrl`. This keeps the draft === `StoredRequest` invariant (mapping to the IPC payload stays identity).

### 4.2 `useGraphqlSchema(draft)` (new hook) — introspection + cache + state machine

Owns everything in §1. Returns:
```ts
interface GraphqlSchemaApi {
  state: SchemaState;                 // "no-schema" | "introspecting" | "ready" | "error" | "sdl-fallback"
  schema: GraphQLSchema | null;       // set in ready & sdl-fallback(valid)
  typeCount: number;                  // Object.keys(schema.getTypeMap()) minus introspection types
  error: string | null;               // classified message when state==="error"
  lastRefreshedAt: string | null;     // from cache fetched_at or the just-now refresh
  refresh: () => Promise<void>;       // re-introspect (§1.4)
  applySdl: (sdl: string) => void;    // §1.5 — buildSchema + cache under sentinel
}
export function useGraphqlSchema(draft: StoredRequest): GraphqlSchemaApi;
```
- On mount / when `draft.url` changes: `gqlSchemaGet(url)` → hydrate (`buildClientSchema` or `buildSchema` via the SDL sentinel) → `ready`/`sdl-fallback`, else `no-schema`.
- `refresh()` runs the §1.1 introspection through `resolveAndSend` (uses the **same `useSendRequest`? No** — schema fetch is a separate concern; call `resolveAndSend` **directly** here so the operation's `sendState`/`ResponseDock` are not clobbered by an introspection response). Classify failures per §1.5.
- Keeps an in-flight guard so double-clicking Refresh doesn't race; the latest wins.

### 4.3 The two-way builder↔editor sync (AST-based, loop-guarded) — the tricky bit

**Single source of truth: `draft.graphql.query` (the text).** The field-tree selection is a **derived projection** of that text, computed by parsing it. Both directions go through the `graphql` AST (`parse` / `visit` / `print`), never string-hacking.

```
                       ┌────────────────────────────────────────────────┐
   tree checkbox ──────►  applySelectionToQuery(query, path, on/off)     │
   (onToggle)           │    parse(query) → AST → add/remove the field   │  setGraphql({query})
                        │    SelectionSet node at `path` → print(AST)    ├──────────────►  draft.graphql.query
                        └────────────────────────────────────────────────┘                     │
                                                                                                │ (query changed)
   editor typing ──────► setGraphql({query})  ──────────────────────────────────────────────────┘
                                                                     │
                                                     ┌───────────────▼──────────────────┐
   FieldTree.selection ◄─── deriveSelection(query, schema) ◄────────┤ parse(query) → walk │
   (checkboxes)              (a Set<FieldPath> of selected paths)    │ selection sets      │
                                                                     └─────────────────────┘
```

**Direction A — tree → query (`applySelectionToQuery`, pure, `src/lib/graphqlSelection.ts`):**
- `parse(query || defaultOperation(opType))` → `DocumentNode`. If the doc is empty/unparseable, start from a fresh operation shell (`query { }`).
- Locate (or create) the operation of the current `operation_type`; walk to the `SelectionSet` at `FieldPath` (a `string[]` of field names from the root). Add the field (with a nested `SelectionSet` seeded with its type's scalar-ish leaf or left empty for the user to expand) or remove its `FieldNode`. Removing the last field of a nested selection prunes the now-empty parent selection.
- `print(nextAst)` → new query text → `setGraphql({ query })`. Uses `graphql`'s printer so formatting is canonical.

**Direction B — query → selection (`deriveSelection`, pure):**
- `parse(query)` → walk the operation's selection sets → produce `Set<string>` of `FieldPath` join-keys (e.g. `"user"`, `"user.id"`, `"user.name"`). If `parse` throws (mid-typing, invalid), **return the previous selection** (don't thrash the tree). `FieldTree` renders a checkbox as checked iff its path is in the set.

**Loop guard (the essential part):**
- The query text is the **only** persisted state; the selection is **always recomputed** from it via `deriveSelection`, never stored independently. So there is no bidirectional state to desync.
- Tree edits produce a new query and stop; they do **not** then re-derive-and-re-apply. Editor edits produce a new query and the tree re-derives; they do **not** write back to the query.
- To stop a churn loop where `print(parse(x)) !== x` (whitespace/format drift re-triggering effects): guard `setGraphql` with a **structural-equality check** — only dispatch if `print(parse(next))` differs from `print(parse(current))` (compare *canonical* forms, ignoring incidental formatting). Implement as `sameOperation(a, b)` in the helper; if equal, skip the dispatch. This makes typing that doesn't change the operation structure (e.g. adding whitespace) not fight the tree, and tree toggles idempotent.
- Debounce editor→`setGraphql` (~150ms) so keystrokes don't re-parse on every character; the tree re-derives on the debounced value.

`useGraphqlBuilder(draft, schema, dispatch)` (new hook) wires this: exposes `selection = deriveSelection(query, schema)`, `toggleField(path)` → `dispatch(setGraphql({ query: applySelectionToQuery(...) }))` (guarded by `sameOperation`), `setOpType`, `setArgs`. The two `src/lib/*` helpers are **pure, no React, unit-tested** (§5).

### 4.4 REST ↔ GraphQL switching & recognition

**Recognition:** `RequestWorkbench` branches on `activeRequest().graphql`:
```
draft.graphql != null  → render <GraphqlExplorer>
draft.graphql == null  → render the REST editor (Feature 1)
```
No new store field; the discriminator is the existing `StoredRequest.graphql`.

**Switching (a request-type toggle in `RequestBar`, next to Method/Save):** a small segmented `REST | GraphQL` control.
- **REST → GraphQL:** `dispatch(setGraphql({ operation_type:"query", query: draft.graphql?.query || "", variables_json: draft.graphql?.variables_json || "{}" }))` → `graphql != null`. Also normalize `method:"POST"` (GraphQL is always POST here) and clear `query_params`. Headers/url/auth are **kept** (so an already-configured endpoint+auth carries over — introspection then works immediately).
- **GraphQL → REST:** `dispatch(setGraphql-clear)` → set `draft.graphql = null` (a `clearGraphql` action variant, or `setGraphql` with a `null` sentinel). The last query/variables are **retained in the graphql meta only while graphql != null**; switching back to GraphQL restores them (persisted once saved). Method/body revert to whatever the REST editor last had (v1: keep `method:"POST"`, empty raw body — user adjusts).
- The control is `role="tablist"` (`REST`/`GraphQL` tabs) with `aria-selected`; never color-only (text labels + a `#i-braces`/`#i-graph` icon). Alternatively expose it as two tabs at the workbench level — either is acceptable; the discriminator remains `draft.graphql`.

**Persistence (Save):** unchanged from Feature 2 — `saveRequest(draft)` → `upsertRequest(draft)`. The `graphql` meta (`operation_type`, `query`, `variables_json`) rides along on the `StoredRequest`. `⌘S` in `RequestWorkbench` saves the GraphQL request exactly like a REST one; the sidebar `RequestRow` can show a `GraphQL` badge (`.gql-badge`, `--lok-syn-gql`) when `graphql != null` (mirrors the mock's titlebar badge) so it's recognizable in the tree.

---

## 5. Cross-cutting rules & test plan

### 5.0 New pure helpers (all unit-tested, no React/Tauri)
- `src/lib/graphqlBody.ts` — `buildGraphqlBody(query, variablesJson) → string` (the `{query,variables}` envelope, `{{...}}`-safe).
- `src/lib/graphqlSelection.ts` — `applySelectionToQuery`, `deriveSelection`, `sameOperation`, `defaultOperation` (all AST-based).
- `src/lib/graphqlIntrospection.ts` — `buildIntrospectionRequest(draft, endpointUrl) → StoredRequest`; `parseSchemaResponse(body) → { schema } | { error }`; `cacheEnvelope(kind, payload)` / `parseCache(json) → GraphQLSchema` (introspection-vs-SDL sentinel, §1.5).

### 5.1 Cross-cutting rules (applied to every component)
- **Shell / 100dvh:** the Explorer fills the grid's `1fr` row; only `.col-body`, `.query-pane`, `.vars-body` scroll (`min-height:0; overflow:auto; .lok-scroll`). The window never scrolls; the 3-column grid is fixed (`280px 1fr 260px`), columns resize within the row.
- **A11y:**
  - **Field tree = a real tree:** container `role="tree"`; each row `role="treeitem"` with `aria-expanded` (expandable rows only), `aria-selected` (checkbox state), `aria-level`; nested children in `role="group"`. Full keyboard: ↑/↓ move, →/← expand/collapse, `Space` toggles the checkbox, `Enter` focuses the type in Docs. Visible `focus-visible` heat ring (free from `base.css`).
  - **Op-type / schema-health / secret-status never color-only** — always icon + text label.
  - Docs type links are keyboard-reachable (Cmd-click is pointer-only; provide `Enter`/`Ctrl+Enter` to navigate).
  - Tabs (`Variables`/`Headers`, `REST`/`GraphQL`): `role="tablist"`/`tab`/`tabpanel`, arrow-key nav, `aria-selected`.
  - SDL parse errors, introspection errors, and schema-health use `aria-live="polite"`.
  - **Contrast:** semantic tokens only (already AA/AAA verified); the gql keyword color is `--lok-syn-gql`; never hardcode a hex.
- **Reduced motion:** the Refresh spinner, any chevron rotation, and the RunButton heat animation are CSS → collapsed to `0.01ms` by the `base.css` hard gate. No JS-driven motion bypasses it.
- **Tabular numbers:** the statusbar's "N types", "K fields selected", and any ms use `.lok-tnums`/`tabular-nums`.
- **Icons:** the one `IconSprite` (`#i-play`, `#i-refresh`, `#i-chev`, `#i-chevr`, `#i-book` from the mock) via `common/Icon`; no CDN, no emoji-as-icon.
- **File size:** each view < ~100 lines; all branching/AST/derivation in `useGraphqlSchema`/`useGraphqlBuilder` and the pure `src/lib/graphql*.ts` helpers.

### 5.2 Test plan (Vitest + RTL; `vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`; mock a small `GraphQLSchema` via `buildSchema` of an inline SDL)

**Pure helpers (fast, no DOM):**
- `graphqlSelection.test.ts` —
  - **checkbox → query contains field:** `applySelectionToQuery("query { }", ["user"], true)` → printed query contains `user`; adding `["user","id"]` nests `id` under `user`; toggling off removes it; removing the last child prunes the empty `user { }`.
  - **edit → selection sync:** `deriveSelection("query { user { id name } }")` → `Set` has `user`, `user.id`, `user.name` (drives which checkboxes are checked); a syntactically-broken query returns the previous selection (no throw).
  - **loop guard:** `sameOperation(print(parse(q)), q_with_extra_whitespace)` is `true` → dispatch skipped; a real structural change is `false`.
- `graphqlBody.test.ts` — `buildGraphqlBody(q, '{"id":"{{env.x}}"}')` → the `{{env.x}}` token is **preserved verbatim** in the output string (interpolation-in-query guard); blank `variablesJson` → `"variables":{}`; `query` is JSON-escaped.
- `graphqlIntrospection.test.ts` —
  - **buildIntrospectionRequest:** returns a `StoredRequest` with `method:"POST"`, `body.text === JSON.stringify({query:getIntrospectionQuery()})`, and **`headers`/`auth` copied from the draft** (proves introspection-with-auth); `graphql:null`.
  - **cache round-trip parsing:** `parseCache(cacheEnvelope("introspection", introspectionData))` → a `GraphQLSchema`; `parseCache(cacheEnvelope("sdl", "type Query{a:Int}"))` (sentinel) → a `GraphQLSchema` (SDL fallback parses).
  - **response classification:** a body with `{errors:[...]}` → `{error}` (introspection disabled); a valid introspection body → `{schema}`.

**Hook / wiring tests (mock invoke):**
- **introspection calls `resolve_and_send` with the introspection query:** trigger `refresh()` → assert `invoke` called with `("resolve_and_send", { request, environmentId })` where `request.body.text` contains `IntrospectionQuery` / `__schema` **and** `request.headers`/`request.auth` deep-equal the draft's (auth carried). Resolve the mock with a valid introspection body → `state === "ready"`, `schema` set, `typeCount > 0`.
- **cache put/get:** after a successful introspection, assert `invoke("gql_schema_put", { endpointUrl, introspectionJson })` fired with the raw JSON; on a fresh mount with `invoke("gql_schema_get", { endpointUrl })` resolving that JSON, `state === "ready"` **without** a `resolve_and_send` call (cache-first, no network).
- **SDL fallback:** with introspection erroring (mock rejects or returns `{errors}`), `applySdl("type Query { hello: String }")` → `state === "sdl-fallback"`, `schema` valid; assert `invoke("gql_schema_put", ...)` stored the SDL sentinel envelope.
- **Run calls `resolve_and_send` with `{query,variables}`:** `onRun()` → `invoke("resolve_and_send", { request, environmentId })` where `request.body.text` parses to `{ query, variables }` matching `draft.graphql`; `environmentId` matches the active env store value (and `null` when none); response flows into the shared `ResponseDock`.
- **interpolation-in-query preserved:** with `draft.graphql.query` containing `{{env.testUserId}}` and variables `{"t":"{{secret.API_TOKEN}}"}`, the `resolve_and_send` request body **still contains** both `{{...}}` tokens (the FE does not interpolate) — asserts our differentiator end-to-end.
- **Run never calls introspection while schema is fresh:** opening the Explorer with a cached schema does not fire `resolve_and_send` until the user hits Run/Refresh.

**Component render tests (RTL, mock schema via `buildSchema`):**
- **checkbox → query:** render `FieldTree` + `QueryEditor` over a mock schema; check `user` → the editor's query text contains `user { ... }`; check `user.id` → contains `id`.
- **edit → checkbox:** type `query { user { id } }` into the editor → the `user` and `id` checkboxes render checked (`deriveSelection` drives them).
- **op-picker re-roots the tree:** switching to `mutation` roots the tree at the Mutation type; `subscription` disabled/absent when the schema has none (option disabled, not color-only).
- **docs Cmd-click:** Cmd-click a type name in `DocsTypePanel` pushes it onto the breadcrumb and focuses it; keyboard `Enter` does the same (a11y).
- **a11y smoke:** tree container has `role="tree"`, rows `role="treeitem"` with `aria-expanded`/`aria-selected`; icon-only buttons (Refresh, Run) expose accessible names; schema-health dot is paired with text.
- **REST↔GraphQL switch:** toggling to GraphQL sets `draft.graphql != null` and renders the Explorer; toggling back nulls it and renders the REST editor; headers/url/auth are preserved across the switch.

---

## 6. Execution order for the coding agent

1. Pure helpers + tests: `graphqlBody`, `graphqlSelection` (`applySelectionToQuery`/`deriveSelection`/`sameOperation`/`defaultOperation`), `graphqlIntrospection` (`buildIntrospectionRequest`/`parseSchemaResponse`/cache envelope). No UI risk, fast feedback; these encode the two hardest ideas (sync + introspection-with-auth).
2. `useGraphqlSchema` (cache-first → introspect-via-`resolve_and_send` → SDL fallback → state machine) + tests.
3. `useGraphqlBuilder` (two-way sync wiring over the helpers) + tests; add the `setGraphql`/`clearGraphql` action to `useRequestDraft`.
4. `QueryEditor` (cm6-graphql + schema) + `FieldTree`/`FieldTreeNode` + `DocsExplorer`/`DocsTypePanel`/`DocsBreadcrumb`.
5. `ExplorerToolbar` (`OperationPicker` + reused `UrlInput` + `RefreshSchemaButton` + `RunButton`) + `OperationVarsPanel` (`VariablesPanel` + reused `HeadersPanel`/`KeyValueTable`) + `ExplorerStatusBar`; assemble `GraphqlExplorer`.
6. Branch `RequestWorkbench` on `draft.graphql`; add the REST↔GraphQL switch to `RequestBar`; add the `.gql-badge` to `RequestRow` when `graphql != null`.
7. `yarn typecheck` + `yarn vitest run` green; visual parity vs `mock-graphql.html` (both themes); confirm no window scroll, the tree is a real `role="tree"`, and the two-way sync holds without a churn loop.

**Definition of done:** typecheck clean, unit tests green, no scrollable window; **introspection goes through `resolve_and_send` carrying the request's headers/auth** (works on authed endpoints); schema cached via `gql_schema_put` and hydrated via `gql_schema_get` (cache-first, offline-friendly); **SDL fallback** parses via `buildSchema`; the field tree ↔ editor stay in sync through the `graphql` AST with a structural-equality loop guard; **Run sends `{query,variables}` through `resolve_and_send`** with `{{env.x}}`/`{{secret.x}}` preserved into the raw body (interpolation-in-query differentiator); response shown in the reused `ResponseDock`; a11y (tree semantics, keyboard, never-color-only) + reduced-motion satisfied; visual match to `mock-graphql.html`.
