# Collections + Environments + Secrets — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + design-system v2 (`--lok-*` tokens).
> **Visual pattern (1:1):** `design-system/preview/mock-request.html` (sidebar tree `.tree/.tree-group/.row`, env pill `.env-pill` + accent) + `design-system/preview/style.css`. Never invent a class/token.
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored 1:1 in `src/lib/types.ts`). **Never invent a field.**
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered commands) + `src/lib/ipc.ts` (typed wrappers — all commands this feature needs are **already wrapped**).

This feature turns the three durable stores (`useCollectionsStore`, `useEnvStore`, `useUiStore`) and the read-only shell components (`Sidebar`, `CollectionTree`, `RequestRow`, `EnvPill`, `EnvDropdown`, `EnvQuickLook`) into a **fully functional Collections + Environments + Secrets surface** that *feeds and persists* the Request Workbench built in Feature 1.

It sits **upstream** of the workbench: the sidebar selects a request → the workbench draft seeds from it → the user edits → "Save" writes the draft back through the sidebar's persistence layer. Nothing in the workbench (`RequestWorkbench`, `useRequestDraft`, `useSendRequest`) changes except one new **Save** affordance in `RequestBar` and a new `saveRequest` store action it calls.

Hard rules that govern everything below (`design-system/MASTER.md` §6, repo feedback):
- **1 component = 1 file.** All logic in hooks (`src/hooks/*`) or pure helpers (`src/lib/*`); view files stay small (< ~100 lines) and dumb. Types at module scope.
- **Shell:** `100dvh`, **no scrollable window** — only inner panes (`.tree`, modal bodies) scroll via `.lok-scroll` (`min-height:0` + `overflow:auto`). Modals/popovers use the `--lok-scrim`; never grow the window.
- **A11y non-negotiable:** `focus-visible` heat ring (free from `base.css`), `aria-*` on every icon-only button, AA/AAA contrast via **semantic tokens only** (never a raw hex), `prefers-reduced-motion` hard gate (free from `base.css`).
- **Never color-only:** method chips, env accents, and secret status all pair color with a text label + Lucide icon (`common/Icon` sprite; no CDN, no emoji-as-icon).
- **SECRET VALUES NEVER LEAVE RUST.** The FE can only `secret_set` / `secret_exists` / `secret_delete`. There is **no** `secret_get` — do not add one, do not hold a secret value in React state beyond the single `secret_set` call, redact it from the field on submit.

---

## 0. What already exists (do not rebuild)

| Piece | State | This feature |
|---|---|---|
| `useCollectionsStore` | `collections`, `requests`, `activeRequestId`, `load`, `selectRequest`, `removeRequest`, `activeRequest()`, `requestsForCollection()` | **Extend** with CRUD + reorder + save actions (§4.1). |
| `useEnvStore` | `environments`, `activeEnvironmentId`, `load`, `switchEnvironment`, `activeEnvironment()`, `activeKind()`, `envKind()` | **Extend** with env CRUD + `mergedVars()` selector (§4.2). |
| `useUiStore` | theme, sidebar width, palette | **Extend** with `envManagerOpen` modal flag (§4.3). |
| `Sidebar` / `CollectionTree` / `RequestRow` | read-only tree, static search input, empty-state | **Make functional** (§1): expandable folders, context menu, DnD, working search. |
| `EnvPill` / `EnvDropdown` / `EnvQuickLook` | switcher pill + hover popover (already masks secrets) | **Wire** switch to `set_active_environment`; QuickLook shows **merged** base→sub vars (§2.4). |
| `ipc.ts` wrappers | `listCollections/upsertCollection/deleteCollection/listRequests/upsertRequest/deleteRequest/listEnvironments/upsertEnvironment/deleteEnvironment/getActiveEnvironmentId/setActiveEnvironment/secretSet/secretExists/secretDelete` | **Reuse verbatim** — all present, none missing. `useShellBootstrap` already calls both stores' `load()` at mount. |

**No new IPC wrappers are required.** Every command this feature touches is already wrapped in `src/lib/ipc.ts` and registered in `src-tauri/src/lib.rs`. If any helper is missing it is a *pure TS helper* in `src/lib/*`, not an IPC call.

---

## 1. CollectionsSidebar — functional tree

Directory: `src/components/sidebar/` (upgrade existing). One row = one file.

```
sidebar/Sidebar                     (existing — becomes the CollectionsSidebar shell)
├── sidebar/SidebarHeader           (NEW — search input + "＋" new-collection / new-request menu)
│   └── common/Icon (#i-search, #i-plus)
├── sidebar/CollectionTree          (existing — now renders a real nested tree)
│   ├── sidebar/TreeGroup           (NEW — folder row: chevron + folder icon + label + context menu)
│   └── sidebar/RequestRow          (existing — MethodBadge + name + active heat edge + context menu)
├── sidebar/RowContextMenu          (NEW — rename / duplicate / delete, shared by folder + request)
├── sidebar/InlineRename            (NEW — controlled text input swapped in for a row's label)
└── common/EmptyState               (existing — empty tree → "Nowy request" action)
```

### 1.1 Load

`useShellBootstrap` (existing) already calls `useCollectionsStore.load()` at mount, which does
`Promise.all([listCollections(), listRequests(null)])` and sets `activeRequestId = requests[0]?.id`.
**No change to load.** The sidebar just subscribes to `collections`, `requests`, `activeRequestId`, `loading`, `loadFailed`.

### 1.2 Tree shape (folders + nesting)

`Collection` has `parent_id` (nullable) and `sort_order`; `StoredRequest` has `collection_id` and `sort_order`.
A pure builder in **`src/lib/collectionTree.ts` (new)** turns the two flat lists into a render tree, **without any React**:

```ts
interface TreeNode {
  collection: Collection;
  children: TreeNode[];        // sub-collections, sorted by sort_order
  requests: StoredRequest[];   // direct requests, sorted by sort_order
}
export function buildTree(
  collections: Collection[],
  requests: StoredRequest[],
): { roots: TreeNode[]; orphanRequests: StoredRequest[] };
```

- Roots = collections with `parent_id == null`. Children keyed by `parent_id`. Every level sorted by `sort_order` then `name`.
- `orphanRequests` = requests whose `collection_id` matches no collection (rendered ungrouped, as today) — keeps the current forgiving behavior.
- Pure + unit-tested (§6). No cycles assumed; a defensive visited-set guards a malformed `parent_id` chain.

`CollectionTree` maps `roots` → `TreeGroup` (recursive) and `orphanRequests` → `RequestRow`.

### 1.3 TreeGroup (folder) — expand/collapse, colors, context menu

**`sidebar/TreeGroup.tsx`** — `{ node: TreeNode; depth: number; activeRequestId: string | null }`.
- Row = `.tree .row .tree-group>.row` (mock): chevron `#i-chev` (rotated when expanded), folder icon, label, indent `padding-left` by `depth`.
- Expand/collapse state is **UI-local**, held in `useSidebarTree` (§1.6) as a `Set<collectionId>` (persisted to `useUiStore` optional; default expanded roots). Chevron rotation is a `--lok-dur-fast` transform, killed by reduced-motion.
- Renders child `TreeGroup`s then `RequestRow`s.
- Right-click / kebab `#i-more` → `RowContextMenu` anchored to the row: **Rename · New request here · New sub-collection · Duplicate · Delete**.

**`sidebar/RequestRow.tsx`** (existing, extended) — add:
- `onSelect(id)` already calls `store.selectRequest` → this is the **load-request trigger** (§3).
- Method color via existing `MethodBadge` (reads `--lok-method-*`; already correct per verb).
- Right-click / kebab → `RowContextMenu`: **Rename · Duplicate · Delete** (`#i-copy`, `#i-trash`).
- Active row keeps the `.row.active` heat left-edge (`--lok-gradient-heat`, `.tree .row.active::before`).

**`sidebar/RowContextMenu.tsx`** — `{ items: MenuItem[]; anchor; onClose }`. A `role="menu"` overlay on `--lok-bg-overlay` + `--lok-shadow-md`, `role="menuitem"` buttons, arrow-key nav, `Esc`/click-away closes, focus returns to the row. Destructive **Delete** item styled with `--lok-status-danger`.

**`sidebar/InlineRename.tsx`** — `{ value; onCommit(name); onCancel }`. A controlled `<input>` that replaces the row label during rename; `Enter` commits, `Esc` cancels, blur commits. `aria-label` = "Zmień nazwę".

### 1.4 CRUD (optimistic) — collections & requests

All mutations run through store actions (§4.1) that follow the **optimistic pattern already used by `removeRequest`**: update the in-memory list first, fire the IPC, roll back on reject.

| Action | Store action | IPC | Optimistic behavior |
|---|---|---|---|
| New collection | `createCollection(parentId)` | `upsertCollection(collection)` | push a `{ id: uuid, name:"Nowa kolekcja", parent_id, sort_order:end, docs_md:null }`; select nothing; on reject remove it + toast. |
| Rename collection | `renameCollection(id, name)` | `upsertCollection(next)` | patch name in place; on reject restore previous name. |
| Delete collection | `removeCollection(id)` | `deleteCollection(id)` | drop the collection **and cascade** its descendant collections + their requests from the in-memory lists (Rust may or may not cascade — the FE mirrors a full-subtree delete so the tree never shows orphans); if the active request was inside, clear `activeRequestId`. On reject, restore snapshot. Confirm in a small dialog first. |
| New request | `createRequest(collectionId)` | `upsertRequest(request)` | reuse `useNewRequest`'s builder shape (`method:"GET", url:"", body:none, auth:none`, default options) but set `collection_id`, push, **select it** (seeds the workbench draft, §3), then persist. |
| Rename request | `renameRequest(id, name)` | `upsertRequest(next)` | patch name; rollback on reject. |
| Duplicate request | `duplicateRequest(id)` | `upsertRequest(copy)` | deep-clone with a fresh `id`, name `"… (kopia)"`, `sort_order` after original; select the copy; persist. |
| Delete request | `removeRequest(id)` (existing) | `deleteRequest(id)` | already implemented; keep. Add a confirm dialog for parity. |
| **Save draft** | `saveRequest(draft)` | `upsertRequest(draft)` | see §3.3 — writes the workbench's edited draft back and refreshes the in-memory `requests` entry. |

`uuid` = `crypto.randomUUID()` with the same fallback as `useNewRequest.makeId` (extract that helper to `src/lib/ids.ts` and reuse in both).

**Rollback contract:** each mutating action snapshots the slice it touches (`{ collections, requests, activeRequestId }`) before the optimistic `set`, and on a rejected IPC calls `set(snapshot)` + surfaces a non-blocking error (a `toast`/`loadError`-style field). Backend stubs currently return `Err` for some commands — the UI must degrade to "local only" gracefully (mirroring today's `load` catch), never crash the shell.

### 1.5 Drag & drop reorder (sort_order)

Reorder requests within a collection and move a request between collections; reorder sub-collections within a parent.

- **Library:** none required for v1 — use native HTML5 DnD (`draggable`, `onDragStart/Over/Drop`) captured in **`useSidebarDnD` (new hook)**. (If the repo later adds `@dnd-kit`, swap the hook internals; the store contract below is library-agnostic.)
- **Drop math** lives in a pure helper **`src/lib/reorder.ts` (new):**
  ```ts
  // returns the new integer sort_order for the dragged item at drop index,
  // and (if a full renumber is cheaper) the renumbered sibling list.
  export function reorderSiblings<T extends { id: string; sort_order: number }>(
    siblings: T[], draggedId: string, targetIndex: number,
  ): { id: string; sort_order: number }[]; // minimal set of items whose sort_order changed
  ```
  Strategy: renumber the affected sibling group to a dense `0..n-1` sequence (simplest, deterministic, unit-testable) rather than fractional keys.
- **Store action** `reorder({ kind: "request"|"collection", id, newParentId, siblings })` (§4.1): optimistically apply the new `sort_order`/`collection_id`/`parent_id`, then **persist each changed entity** via `upsertRequest`/`upsertCollection` (batch `Promise.all`); rollback the whole batch on any reject.
- **A11y:** DnD is mouse-only; provide a **keyboard alternative** in `RowContextMenu` ("Przenieś w górę / w dół") that calls the same `reorder` action, so reordering is possible without a pointer. Dragged row gets `aria-grabbed`; drop targets show a heat insertion line (`--lok-gradient-heat-line`, 2px), collapsed by reduced-motion.

### 1.6 `useSidebarTree` (new hook) — view-state only

`{ expanded: Set<string>; toggle(id); isExpanded(id); menu: {openFor, close, target}; renaming: string|null; startRename(id); commitRename; cancelRename; query; setQuery }`.
Holds **only ephemeral view state** (expansion, which row's menu/rename is open, search query). All data mutations delegate to the store actions. Search filters the tree by request name / method / url substring (case-insensitive) and **auto-expands** matching folders; empty query restores manual expansion. Filtering is a pure helper `filterTree(tree, query)` in `collectionTree.ts` (unit-tested).

### 1.7 Empty states (with an action)

- **No collections & no requests** → existing `EmptyState` ("Rozgrzej pierwszą lokówkę", `⌘N` → `useNewRequest`). Keep.
- **`loadFailed`** (backend stub `Err`) → same empty state but hint "Backend niedostępny — pracujesz lokalnie" so the user knows persistence is degraded.
- **A collection with zero requests** → an inline muted "Pusto — dodaj request" row inside the group that triggers `createRequest(collectionId)`.

---

## 2. EnvironmentManager

A modal panel to manage environments (base + sub via `parent_id`), their public variables, and the *names* of their secrets. Plus the topbar switcher wiring and the QuickLook merge.

Directory: `src/components/env/` (new).

```
env/EnvironmentManager           (NEW — modal shell, opened from EnvPill dropdown footer or ⌘K)
├── env/EnvList                   (NEW — left column: base envs + nested sub-envs, add/select/delete)
├── env/EnvEditor                 (NEW — right column for the selected env)
│   ├── env/EnvMeta               (NEW — name, parent (base) select, color/kind select)
│   ├── env/VariablesTable        (NEW — public KeyValue table; reuse workbench/KeyValueTable)
│   └── env/SecretNamesList       (NEW — secret_names rows → bridges to SecretsManager, §3)
└── env/ConfirmDialog             (shared confirm; reuse for collection/request deletes too)
```

### 2.1 Open/close

`EnvironmentManager` mounts when `useUiStore.envManagerOpen` is true (backdrop `--lok-scrim`, dialog `--lok-radius-lg`, `--lok-shadow-lg`, `role="dialog"` `aria-modal="true"`, focus-trapped, `Esc` closes, focus returns to the pill). Opened from a **"Zarządzaj środowiskami…"** footer item in `EnvDropdown` and from the command palette.

### 2.2 EnvList — list / create / delete environments

- Lists environments grouped by base: a `parent_id == null` env, then its children indented. Bases and children both carry the env-kind accent dot (`data-env` → `--lok-env-accent`) and, for prod, the explicit **PROD** danger label (never color-only — same rule as `EnvDropdown`).
- **Create:** "＋ Nowe środowisko" → `createEnvironment(parentId|null)` (§4.2) → optimistic push of `{ id:uuid, name:"Nowe środowisko", parent_id, color:null, variables:[], secret_names:[] }`, select it, `upsertEnvironment`.
- **Delete:** `removeEnvironment(id)` → confirm → optimistic drop (cascade sub-envs) → `deleteEnvironment`. If the deleted env was active, `switchEnvironment(null)` (which clears the pill and calls `set_active_environment(null)`).
- **Select:** sets a local `selectedEnvId` in `useEnvManager` (§2.5) to drive the editor — this is *editing selection*, distinct from `activeEnvironmentId` (the *live/switched* env).

### 2.3 EnvEditor — edit one environment

- **EnvMeta:** `name` (text), `parent_id` (a `<select>` of base envs, or "— (to jest baza)"), and **kind/color** (`<select>` of `local | dev | staging | prod | custom` written into `Environment.color`, which `envKind()` already reads back). Prod selection shows a `--lok-status-danger` warning strip "Środowisko produkcyjne — działaj ostrożnie". Every change dispatches `patchEnvironment(id, partial)` (optimistic + `upsertEnvironment`, debounced ~300ms so typing doesn't spam IPC).
- **VariablesTable:** the **public** `variables: KeyValue[]` edited through the **existing** `workbench/KeyValueTable` (controlled rows, ghost-row append, enable/disable, remove). These are commit-safe values — plain text, shown fully. Changing rows → `patchEnvironment(id, { variables })`.
- **SecretNamesList:** the `secret_names: string[]` — add a name (input + "＋"), remove a name (removes it from `secret_names` **and** offers `secret_delete(name)` to purge the Keychain value). Each row bridges to `SecretsManager` controls (§3). **A secret is a *name* here; its value is never in this component's state.**

### 2.4 QuickLook — merged (inherited) variables, secrets masked

`EnvQuickLook` already masks secrets by name. **Extend it to show the merged base→sub view** so the user sees what the request will actually resolve against:

- A pure selector **`mergedVars(environments, envId)`** in **`src/lib/envMerge.ts` (new)** walks the `parent_id` chain (base → … → this env) and folds `variables` with **child overriding parent by name**; `secret_names` are **unioned** across the chain. Returns:
  ```ts
  interface MergedVar { name: string; value: string; isSecret: boolean; source: "own" | "inherited" }
  export function mergedVars(all: Environment[], envId: string): MergedVar[];
  ```
- `isSecret` = name ∈ the unioned `secret_names` → rendered as `••••••••` (never the value; secrets have no value on the FE anyway). `source: "inherited"` rows get a subtle tag/dimmer color so overrides are visible.
- The same `mergedVars` selector is exposed on `useEnvStore` as `mergedActiveVars()` for the pill's QuickLook and for any future "resolved preview". Cycle-guarded like `buildTree`.
- **Backend parity note:** actual resolution/merge + secret fetch happens in Rust at `resolve_and_send` time; `mergedVars` is a **display-only** mirror for the QuickLook. It must match Rust's precedence (child overrides parent) but is never the source of truth for a real send.

### 2.5 `useEnvManager` (new hook) — modal view-state

`{ selectedEnvId; selectEnv(id); draftPatch; ... }` — ephemeral selection + debounced patch buffering; all data goes through `useEnvStore` actions. Keeps `EnvironmentManager` view files thin.

### 2.6 Topbar switcher (already partly wired)

`EnvPill` → `useEnvPill` → `useEnvStore.switchEnvironment(id)` already sets `activeEnvironmentId` optimistically and calls `setActiveEnvironment(id)` (IPC `set_active_environment`). **Confirm and keep** this. On mount, `useEnvStore.load()` reads `getActiveEnvironmentId()`. The pill's `data-env={kind}` drives `--lok-env-accent`; the env-switch is one of the 3 sanctioned "wow" motions (accent cross-fade, `--lok-dur-base`) — reduced-motion collapses it. Add the **"Zarządzaj środowiskami…"** footer item to `EnvDropdown` that sets `useUiStore.envManagerOpen = true`.

---

## 3. SecretsManager — set / exists / delete only (values never displayed)

Directory: `src/components/env/` (with the manager) + one hook.

**The single hard security invariant of this feature:** the frontend has exactly three secret operations — `secret_set(name, value)`, `secret_exists(name) → bool`, `secret_delete(name)`. **There is no read.** A secret value exists in FE memory only transiently inside the `SetSecretDialog` while typing, is passed once to `secret_set`, and is cleared immediately after. It is **never** rendered, logged, stored in zustand, or put in a `StoredRequest`/`Environment`.

```
env/SecretNamesList              (§2.3 — one row per name in secret_names)
├── env/SecretStatusBadge        (NEW — "Ustawiony" / "Pusty" from secret_exists; icon + label, never color-only)
├── env/SetSecretDialog          (NEW — password-type input → secret_set; value redacted on submit)
└── (delete)                     → secret_delete + remove from secret_names
```

### 3.1 Status — `secret_exists`

**`useSecrets` (new hook)** holds a `Map<name, "set" | "empty" | "checking">`. On `SecretNamesList` mount (and after any mutation) it calls `secretExists(name)` per name (`Promise.all`) and fills the map. **`SecretStatusBadge`** renders:
- `set` → `--lok-status-success` dot + `#i-lock` + label "Ustawiony".
- `empty` → `--lok-status-warn` dot + `#i-unlock` + label "Pusty — ustaw wartość".
- `checking` → neutral spinner.
Never color-only: always dot **+ icon + text**.

### 3.2 Set — `secret_set`

**`env/SetSecretDialog.tsx`** — `{ name; onDone }`. A `role="dialog"` with a single `<input type="password" autoComplete="off">` (`aria-label={"Wartość sekretu " + name}`), a **"Zapisz do Keychain"** button, and a persistent **Keychain warning banner** (`--lok-status-warn-bg`, `#i-shield`): *"Wartość zostanie zapisana w macOS Keychain i nigdy nie wraca do aplikacji. Lokówka nie może jej odczytać ani wyświetlić."* On submit → `secretSet(name, value)` → clear the input state → `useSecrets.refresh(name)` → close. On reject show inline error (`aria-live="polite"`), still clear the value.

### 3.3 Delete — `secret_delete`

Row "Usuń wartość" → confirm → `secretDelete(name)` → `useSecrets.refresh(name)` → status flips to "Pusty". Removing the **name** from `secret_names` (in EnvEditor) additionally calls `secretDelete` to avoid an orphaned Keychain entry, then `patchEnvironment`.

### 3.4 Visual Keychain warning (global)

Anywhere secrets are surfaced (SecretNamesList header, SetSecretDialog, QuickLook secret rows) shows the shield-tinted note that values live in Keychain and are unrecoverable by the app. This is both a11y honesty and a security affordance — the user must know a set secret cannot be read back.

---

## 4. Store wiring (which action goes where)

### 4.1 `useCollectionsStore` — added actions

```ts
// data mutations (optimistic + IPC + rollback)
createCollection(parentId: string | null): Promise<void>;
renameCollection(id: string, name: string): Promise<void>;
removeCollection(id: string): Promise<void>;              // cascade subtree in memory
createRequest(collectionId: string): Promise<string>;    // returns new id; auto-selects
renameRequest(id: string, name: string): Promise<void>;
duplicateRequest(id: string): Promise<string>;
saveRequest(draft: StoredRequest): Promise<void>;         // upsert_request + patch in-memory entry
reorder(op: ReorderOp): Promise<void>;                    // request move / sibling reorder
// removeRequest / selectRequest / load / activeRequest already exist
```
- `saveRequest` is the **write-back path** for the workbench: `upsertRequest(draft)` then replace the matching `requests[i]` with the returned (canonical) entity so `activeRequest()` returns the saved version. Optimistic, rollback on reject.
- All actions snapshot → `set` optimistically → `await ipc` → rollback + error on reject (the pattern `removeRequest` already demonstrates).
- Extract `makeId` from `useNewRequest` to `src/lib/ids.ts`; use it here and there.

### 4.2 `useEnvStore` — added actions & selector

```ts
createEnvironment(parentId: string | null): Promise<void>;
patchEnvironment(id: string, partial: Partial<Environment>): Promise<void>;  // name/parent/color/variables/secret_names
removeEnvironment(id: string): Promise<void>;               // cascade sub-envs; clear active if needed
mergedActiveVars(): MergedVar[];                            // display-only merge (src/lib/envMerge.ts)
mergedVarsFor(id: string): MergedVar[];
// switchEnvironment / load / activeEnvironment / activeKind / envKind already exist
```
- `patchEnvironment` merges the partial onto the current env, optimistic `set`, debounced `upsertEnvironment` (debounce lives in `useEnvManager`, not the store, so the store stays synchronous-testable).
- `mergedActiveVars` delegates to the pure `mergedVars` (§2.4).

### 4.3 `useUiStore` — added flag

```ts
envManagerOpen: boolean;
openEnvManager(): void;
closeEnvManager(): void;
// optional: sidebarExpanded: string[] if we persist folder expansion
```

### 4.4 IPC wrappers

**None to add.** Confirm every action maps to an existing wrapper:
`upsertCollection/deleteCollection/upsertRequest/deleteRequest/upsertEnvironment/deleteEnvironment/setActiveEnvironment/secretSet/secretExists/secretDelete` — all present in `src/lib/ipc.ts`. If a batch reorder needs many upserts, just `Promise.all` the existing single-entity wrappers (there is no batch command; do not invent one).

---

## 5. The load-request → workbench contract (CANONICAL — read this)

**This contract already exists and this feature must honor it exactly — do not introduce a second channel.**

```
Sidebar click
  → RequestRow.onSelect(id)
  → useCollectionsStore.selectRequest(id)         // sets activeRequestId
  → RequestWorkbench reads useCollectionsStore.activeRequest()   // derived: requests.find(id === activeRequestId)
  → useRequestDraft(activeRequest)                // useEffect on seed.id dispatches { kind:"seed", request }
  → draft resets to the selected StoredRequest    // workbench editor now shows it
```

**Mechanism: store-driven selection, not an event/callback.** The single source of truth for "which request is open" is `useCollectionsStore.activeRequestId`. The workbench is a **subscriber** — it never receives an imperative "load this" call; it re-derives `activeRequest()` and `useRequestDraft` re-seeds because its `useEffect` dependency is `seed?.id`. This is already implemented in `RequestWorkbench.tsx` + `useRequestDraft.ts`; the sidebar's only job is to call `selectRequest(id)` (which `RequestRow` already does).

**Why store, not callback/event:** (1) selection must survive component remounts and be readable by the statusbar, palette, and "unsaved" guards; (2) the draft is intentionally *local* to the workbench and re-seeds purely from `seed.id` — a callback would duplicate that trigger and risk double-seeding; (3) it matches the repo rule "logic in hooks / state in stores," keeping views dumb.

### 5.1 Save (draft → store → persist)

The reverse direction — the **new Save affordance**:
```
RequestBar "Save" (⌘S)                            // new icon-button in RequestBar
  → RequestWorkbench.onSave()                      // reads current draft
  → useCollectionsStore.saveRequest(draft)         // §4.1
  → upsertRequest(draft) (IPC) + patch requests[i] // canonical entity replaces in-memory copy
```
`RequestWorkbench` adds `onSave = () => void saveRequest(draft)` and a `⌘S` handler alongside the existing `⌘↵`. `RequestBar` gains a `Save` button (`#i-save`, `aria-label="Zapisz request"`) disabled when the draft equals the persisted request (a shallow "dirty" check via `JSON.stringify(draft) !== JSON.stringify(activeRequest)` in a `useIsDirty` helper). Newly-created requests (`createRequest`) are already persisted; Save just re-upserts edits.

### 5.2 Unsaved-edit guard (nice-to-have)

Selecting a *different* request while the current draft is dirty should either auto-save or prompt. v1: keep it simple — the draft is discarded on re-seed (current behavior). If time permits, add a "Niezapisane zmiany" confirm in `selectRequest` interception at the workbench level (a `useUnsavedGuard` hook), **not** in the store, to keep the store pure. Gate behind the dirty check.

---

## 6. Cross-cutting rules & a11y

- **Shell / 100dvh:** the sidebar `.tree` and every modal body scroll internally (`min-height:0; overflow:auto; .lok-scroll`); the window never scrolls. Modals use `--lok-scrim` + focus trap; popovers/menus are `--lok-z-dropdown`, the env modal `--lok-z-modal`.
- **A11y:**
  - Every icon-only control (＋, kebab `#i-more`, remove `✕`, copy, lock, delete) carries an `aria-label`.
  - Method / env-kind / secret-status are **never color-only** — always icon + text label (design-system §6).
  - Context menus: `role="menu"`/`menuitem`, arrow-key nav, `Esc` closes, focus returns to the anchor. Env modal: `role="dialog"` `aria-modal`, focus trap, labelled by its title.
  - Tree: `nav` + `role="tree"`/`treeitem`/`group` with `aria-expanded` on folders, `aria-current` on the active request row; DnD exposes `aria-grabbed` and has a keyboard reorder alternative (§1.5).
  - Secret status + set/delete result regions use `aria-live="polite"`.
  - `focus-visible` heat ring comes free from `base.css`; never remove an outline without it. Hit targets ≥ 24px (dense) / ≥ 32px (primary actions).
- **Reduced motion:** chevron rotation, DnD insertion line, env-accent cross-fade, modal entrance — all CSS transitions/animations → collapsed to `0.01ms` by the `base.css` hard gate. No JS motion that bypasses the gate.
- **Tokens only:** consume `--lok-*` semantic tokens; reuse the mock's `.tree/.row/.env-pill` classes and `KeyValueTable`'s `.kv` grid. No hardcoded hex, no new color.
- **Secrets:** the FE never calls a secret *read* (none exists); values live only transiently in `SetSecretDialog`; the Keychain warning is always visible where secrets are surfaced.
- **File structure:** each view < ~100 lines; branching/derivation in `useSidebarTree`/`useSidebarDnD`/`useEnvManager`/`useSecrets` hooks and the pure `src/lib/*` helpers.

New pure helpers (all unit-tested, no React/Tauri): `src/lib/collectionTree.ts` (`buildTree`, `filterTree`), `src/lib/reorder.ts` (`reorderSiblings`), `src/lib/envMerge.ts` (`mergedVars`), `src/lib/ids.ts` (`makeId`), and a small `src/lib/dirty.ts` (`isRequestDirty`).

---

## 7. Test plan (Vitest + React Testing Library, `vi.mock` the invoke boundary)

Mock Tauri: `vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`. Assert on **invoke command name + payload shape**, not internals. Existing `src/test/setup.ts` covers ResizeObserver / scrollIntoView.

### 7.1 Pure-helper unit tests (fast, no DOM)
- **`collectionTree.test.ts`** — `buildTree`: nesting by `parent_id`, sort by `sort_order` then `name`, orphan requests surfaced, malformed cycle guarded (no infinite loop). `filterTree`: name/method/url substring match, matching folders auto-expand, empty query passes through.
- **`reorder.test.ts`** — `reorderSiblings`: dense `0..n-1` renumber, move up/move down, move to head/tail, single-item no-op; only changed items returned.
- **`envMerge.test.ts`** — `mergedVars`: child overrides parent by name; `secret_names` unioned; `source` flags own vs inherited; `isSecret` from the union; base-only env returns its own; missing/cyclic `parent_id` guarded.
- **`dirty.test.ts`** — `isRequestDirty`: false for identical, true when any field diverges.

### 7.2 Store tests (optimistic + rollback + IPC payload)
- **load → tree render:** given `list_collections`/`list_requests` resolves, store fills `collections`/`requests`, `activeRequestId = requests[0].id`; `CollectionTree` renders folders + rows with method colors.
- **select → draft:** `selectRequest(id)` sets `activeRequestId`; **rendering the workbench with that store state seeds `useRequestDraft` to that request** (assert the URL/method in the editor equals the selected request — proves the load-request contract §5).
- **create optimistic:** `createRequest(cid)` pushes locally *before* the IPC resolves and calls `invoke("upsert_request", { request })` with `request.collection_id === cid`; the new request is auto-selected.
- **delete optimistic + rollback:** `removeRequest(id)` drops it immediately; when `invoke("delete_request", { id })` **rejects**, the store restores the request (snapshot rollback) and sets an error.
- **rename optimistic:** `renameCollection(id, "X")` patches name then calls `invoke("upsert_collection", { collection })` with the new name; reject → restore old name.
- **reorder:** dragging request to a new index calls `reorderSiblings`, then `invoke("upsert_request", …)` per changed sibling with the new `sort_order`; a cross-collection move sets `collection_id`.
- **saveRequest:** `saveRequest(draft)` calls `invoke("upsert_request", { request: <draft> })` and replaces the in-memory entry so `activeRequest()` deep-equals the saved draft.

### 7.3 Environment tests
- **env switch → set_active_environment:** clicking an option in `EnvDropdown` (or `switchEnvironment(id)`) sets `activeEnvironmentId` optimistically and calls `invoke("set_active_environment", { id })`; `id: null` supported; pill accent (`data-env`) updates.
- **env CRUD:** `createEnvironment(null)` → `invoke("upsert_environment", { environment })` with `parent_id:null`; `patchEnvironment(id,{variables})` → upsert with merged env; `removeEnvironment` → `invoke("delete_environment",{id})` + active cleared when it was active; all optimistic with rollback on reject.
- **QuickLook merge + mask:** given a base env with `{host}` and a sub env overriding `{host}` + a secret `TOKEN`, `EnvQuickLook`/`mergedActiveVars` shows the child's `host`, the inherited-only vars tagged `inherited`, and `TOKEN` as `••••••••` — assert **the secret value string never appears in the DOM**.

### 7.4 Secrets tests (mock invoke — value never rendered)
- **exists → status:** mount `SecretNamesList` with names `["A","B"]`; `invoke("secret_exists",{name})` resolves `true`/`false` → badges show "Ustawiony" / "Pusty" (icon + text, not color-only).
- **set:** `SetSecretDialog` submit calls `invoke("secret_set", { name, value })` **exactly once** with the typed value; after submit the input value is cleared and the badge refreshes to "Ustawiony".
- **delete:** delete calls `invoke("secret_delete", { name })`; badge flips to "Pusty"; removing the name also purges Keychain.
- **secret never displayed (guard):** after `secret_set`, assert the value string is **absent** from `screen`/the component tree; assert `invoke` is **never** called with any read/`secret_get` command (there is none) and no `Environment.variables` row ever contains a secret value.
- **a11y smoke:** icon-only buttons expose accessible names; env modal is `role="dialog"` `aria-modal`; tree folders expose `aria-expanded`; the Keychain warning is present in `SetSecretDialog`.

---

## 8. Execution order for the coding agent

1. Pure helpers + tests: `ids`, `collectionTree` (`buildTree`/`filterTree`), `reorder`, `envMerge`, `dirty`. Fast, no UI risk.
2. Store actions: extend `useCollectionsStore` (§4.1), `useEnvStore` (§4.2), `useUiStore` (§4.3) + their tests (optimistic/rollback/payload).
3. Sidebar functional: `useSidebarTree`, `SidebarHeader`, `TreeGroup`, `RowContextMenu`, `InlineRename`; wire `CollectionTree`/`RequestRow` CRUD; then `useSidebarDnD` reorder.
4. Save path: `saveRequest` action + `RequestBar` Save button + `⌘S` in `RequestWorkbench` + `useIsDirty` (the only workbench touch).
5. Env: `useEnvManager`, `EnvironmentManager` (`EnvList`/`EnvEditor`/`EnvMeta`/`VariablesTable`/`SecretNamesList`), open from `EnvDropdown` footer + `useUiStore.envManagerOpen`; extend `EnvQuickLook` to `mergedVars`.
6. Secrets: `useSecrets`, `SecretStatusBadge`, `SetSecretDialog`, delete flow + Keychain warnings.
7. `yarn typecheck` + `yarn vitest run` green; visual parity vs `mock-request.html` (both themes); confirm no window scroll and the load-request contract (§5) end-to-end.

**Definition of done:** typecheck clean, unit tests green, no scrollable window, clicking a request seeds the workbench draft (store-driven contract §5), Save writes back via `upsert_request`, env switch hits `set_active_environment`, QuickLook shows merged inherited vars with secrets masked, secrets only ever `set/exists/delete` (value never rendered/read), a11y + reduced-motion satisfied, visual match to the mock.
