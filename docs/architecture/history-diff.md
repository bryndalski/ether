# History + Replay + Response Diff — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + CodeMirror 6 (read-only) + Tailwind v4 (utility-only) + design-system v2 (`--lok-*` tokens).
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored in `src/lib/types.ts`) — `HistoryEntry`, `RequestSpec`, `ResponseData`, `Timings`, `KeyValue`. **Never** invent a field.
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered `history_list` / `history_clear`) + `src/lib/ipc.ts` (`historyList` / `historyClear` wrappers, already present).
> **Reuses:** `ResponseDock` + subcomponents (`StatusBadge`, `ResponseMeta`, `ResponseBody`, `ResponseHeaders`, `TimelineWaterfall`, `VerboseLog`), `useSendRequest`, `useRequestDraft`, `relativeTimeLabel`, `httpStatus`, `format`, `waterfall`. History entries are **the same `ResponseData` objects** the workbench already renders — nothing new to render, only new ways to reach them.

This feature adds a **History** surface (list of past executions), a **Replay** action (load a past request back into the draft and re-send), and a **Response Diff** view (compare two history entries structurally). It sits alongside the existing Request Workbench (`docs/architecture/request-workbench.md`) and does **not** change the send/draft contract.

Hard rules that govern everything below (from `design-system/MASTER.md` §6 + repo feedback):
- **1 component = 1 file.** All logic in hooks; view files stay small and dumb. Types at module scope.
- **PWA/desktop shell:** `100dvh`, **no scrollable window** — only inner panes scroll via `.lok-scroll` (`overflow` on the pane, never the body).
- **A11y non-negotiable:** `focus-visible` heat ring (base.css), `aria-*` on every icon-only button, AA contrast (tokens only — never a hex), `prefers-reduced-motion` hard gate (base.css). Diff is **never color-only** — every added/removed/changed line carries a text sigil (`+` / `−` / `~`) and an `aria-label`.
- **Tabular numbers** (`.lok-tnums` / `font-variant-numeric: tabular-nums`) on every status code, `ms`, byte size, and timing delta.
- **Icons:** Lucide via the existing `<Icon>` sprite (`common/Icon` + `IconSprite`). No CDN, no emoji-as-icon.
- **Secrets are already redacted in Rust.** `history_add` (engine-side, `store.rs::redact_request`) stores the request with **secret values replaced by `•••`** *before* it hits SQLite. Therefore **every `HistoryEntry.request` returned by `history_list` is redacted** — this is the central fact that shapes the Replay design (§4).

---

## 0. THE REDACTION FACT (read first — it drives everything)

`history_add` runs engine-side after each send (`engine.rs:474` → `store::history_add`). Before insert, `store.rs::redact_request(spec)` replaces secret-bearing values with the literal `•••`:

| Field | Redacted to `•••` when… | Left intact |
|---|---|---|
| `auth: bearer` | always (`token → •••`) | — |
| `auth: basic` | `password → •••` | `username` |
| `auth: api_key` | `value → •••` | `name`, `placement` |
| `auth: sig_v4` | never (no secret in spec; creds resolve from `~/.aws` at send) | `profile`, `region`, `service` |
| `headers[*]` | name ∈ `SECRET_HEADER_NAMES` (Authorization, Cookie, X-Api-Key, …) → `value = •••` | non-secret header values |
| `query_params[*]` | name contains a `SECRET_QUERY_FRAGMENTS` fragment (token/key/secret/…) → `value = •••` | non-secret params |
| `body` | **not redacted** (raw/form/multipart bodies persist as-authored) | — |

**Consequences, non-negotiable:**
1. A history request that shows `Authorization: •••` **does not hold the real token**. The FE must **never** send `•••` to a server as if it were a credential.
2. Replay therefore restores **structure** (method, url, non-secret headers/params, body) and treats every `•••` as a **hole the user must re-fill from the environment** — see §4 for the exact behaviour and UI.
3. This is a *safety* property, not a limitation to work around: history never leaks secrets, and Replay re-resolves them live through the normal `resolve_and_send` path (env + Keychain in Rust), so a replay is always signed/authenticated with *current* secrets, never a stale copy.

---

## 1. Where it lives in the layout

Design v2 shell is `100dvh` grid: titlebar / (sidebar | Zone 2 editor + Zone 3 response) / statusbar. History must not add a scrollable window.

**Decision: History is a right-side slide-over drawer, opened from the statusbar; Diff is a full-height overlay panel within the same drawer.** Rationale:
- The sidebar is already owned by Collections/Env; adding a persistent History rail would crowd the tree and break the "one rail" mental model.
- A drawer is **transient** (Escape/backdrop closes it), so it never competes with the workbench for permanent space — it overlays Zone 2+3 at `z-index: modal (1000)` with a scrim.
- The statusbar already shows the last-request summary + a relative-time label (`relativeTimeLabel`); a **"History" affordance in the statusbar** is the natural entry point ("what did I just run?").

```
AppShell (existing, unchanged 100dvh grid)
│
├── statusbar/StatusBar (existing — add a History trigger button)
│   └── statusbar/HistoryTrigger      (icon-button "i-history" + count; opens the drawer)
│
└── history/HistoryDrawer             (NEW — portal/overlay, z-index modal, scrim, Escape-close)
    ├── history/HistoryDrawerHeader   (title, scope toggle, Clear button, close ✕)
    │   ├── history/HistoryScopeToggle  (All ⇄ This request — segmented control)
    │   └── history/CompareBar          ("2 selected — Compare" / "Select two entries")
    ├── history/HistoryList           (.lok-scroll — the only scrolling region)
    │   └── history/HistoryRow          (one per HistoryEntry)
    │       ├── common/MethodBadge      (existing)
    │       ├── response/StatusBadge     (existing — reused, compact variant)
    │       └── history/HistoryRowMeta   (relative time · total_ms · size)
    └── history/DiffPanel              (NEW — overlays the list when 2 entries chosen)
        ├── history/DiffHeader          (A vs B labels, split/unified toggle, close)
        ├── history/DiffTabs            (Body | Headers | Timing — role=tablist)
        ├── history/JsonDiffView         (structural body diff)
        ├── history/HeadersDiffView      (KV header diff)
        └── history/TimingDiffView       (per-phase + total delta)
```

Selecting a single row → loads that entry's **response** into the existing `ResponseDock` in **read-only snapshot mode** (§3). Selecting two rows → `DiffPanel`.

Directory: `src/components/history/` (new). Diff-adjacent pure helpers go in `src/lib/`.

---

## 2. History list

### 2.1 Data + scope

Two scopes, driven by `history_list`'s optional `request_id`:
- **All** → `historyList(null, limit)` — global feed, newest first (Rust already `ORDER BY executed_at DESC, rowid DESC`).
- **This request** → `historyList(activeRequestId, limit)` — filtered to the currently-open request in `useCollectionsStore`. `HistoryEntry.request_id` is `string | null`; when the active request has an id, filter to it; when there is no active request, the toggle is disabled and scope forces **All**.

`limit`: pass `null` to use Rust's `DEFAULT_HISTORY_LIMIT`; the drawer keeps a "Load more" affordance that re-fetches with a larger explicit limit (or `0` = unbounded — Rust maps `Some(0)` to no limit). v1 default: `null` (default page), "Load more" bumps to `Some(200)`.

### 2.2 Row anatomy (`history/HistoryRow.tsx`)

`{ entry: HistoryEntry; selected: boolean; selectionIndex: number | null; onOpen: () => void; onToggleSelect: () => void; now: number }`

One row renders, left→right, all **tabular-nums** for numbers:
- **Method** — `MethodBadge` from `entry.request.method` (reuse existing verb tint).
- **Status** — `StatusBadge` (compact) from `entry.response.status` (color by class; never color-only — reason text paired). Reuse `httpStatus.ts::statusText` + class→token.
- **URL** — `entry.request.url`, mono, truncated with `title` = full url. `{{var}}`/`•••` fragments render verbatim (this is the redacted stored spec).
- **Relative time** — `relativeTimeLabel(entry.executed_at, now)` (reuse `src/lib/relativeTime.ts`; "just now" / "2 min ago"). Full ISO in `title`.
- **Duration** — `entry.response.timings.total_ms` → `${round} ms` via `format.ts`.
- **Size** — `entry.response.size_download_bytes` → `humanBytes()` via `format.ts`.
- **Select checkbox** — for diff selection; shows the selection ordinal (`A` / `B`) when picked. `aria-label={"Zaznacz do porównania: " + method + " " + url}`.

Whole-row click (outside the checkbox) → `onOpen` (preview in ResponseDock). Row is a `<button>`/`role="button"` with `aria-label` summarising method + status + relative time. Active/opened row gets the heat left-bar (`.request-row.active` pattern, reused from the sidebar).

`now` is a single timestamp captured by the drawer (or a 30 s ticking value) and threaded down so all rows share one clock and relative labels stay consistent (no per-row `Date.now()`).

### 2.3 Empty / loading / error

- **Loading** → skeleton rows (reduced-motion collapses the shimmer).
- **Empty** → `EmptyState` (existing): "Brak historii — wyślij request, żeby ją tu zobaczyć." icon `i-history`.
- **Load error** (`history_list` rejects) → inline danger banner (`--lok-status-danger` / `-danger-bg`) with the message + Retry.

### 2.4 Clear history

`HistoryDrawerHeader` "Clear" button → **confirmation required** (irreversible). Reuse the app's confirm affordance (a small inline `role="alertdialog"` popover, `aria-labelledby`/`aria-describedby`): "Usunąć całą historię? Tej operacji nie można cofnąć." with Cancel / Delete (danger). Confirm → `historyClear()` → on success clear the store's `entries` and any diff selection; on reject → danger banner. `history_clear` is global (Rust wipes the whole table) — the confirm copy must say **"całą historię"** even when the current scope is "This request", so the user isn't surprised that a filtered view still deletes everything. (Per-request clear is not a backend capability today — do not fake it client-side.)

### 2.5 Open a single entry → read-only preview

Clicking a row streams `entry.response` into the **existing** `ResponseDock` in a read-only snapshot mode:
- `ResponseDock` currently takes `{ sendState: SendState }`. Add an optional `snapshot?: { response: ResponseData; source: "history"; executedAt: string }` prop. When `snapshot` is present, the dock ignores `sendState`, renders `phase: "success"`-equivalent from the snapshot, and shows a small **"History · {relativeTime}"** ribbon in `.resp-head` so it's unmistakable this is not a live response. All existing tabs (Body/Headers/Timeline/curl -v) work unchanged — they already read a `ResponseData`.
- Exiting snapshot mode (send a new request, or close the drawer via an explicit "Back to live" affordance) restores the live `sendState` view. The dock never mutates history.
- **No re-fetch, no network** — the snapshot is pure display of stored bytes.

---

## 3. State + wiring — `useHistoryStore` (zustand)

New store `src/state/useHistoryStore.ts`, matching the existing store style (`useUiStore` / `useEnvStore` — `create<T>((set, get) => …)`, no persistence; history persistence is SQLite in Rust).

```ts
// src/state/useHistoryStore.ts
type HistoryScope = "all" | "request";

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;

  scope: HistoryScope;
  // ids of entries picked for diff; max 2, FIFO when a 3rd is added
  selectedIds: string[];
  // the entry currently previewed in the dock (single-open), or null
  openedId: string | null;

  drawerOpen: boolean;
  diffOpen: boolean;

  // --- actions ---
  open: () => void;
  close: () => void;
  setScope: (scope: HistoryScope) => void;
  // load/refresh respects scope + activeRequestId (passed in — the store does
  // not read useCollectionsStore directly to keep it decoupled/testable)
  load: (activeRequestId: string | null, limit: number | null) => Promise<void>;
  refresh: (activeRequestId: string | null) => Promise<void>;
  clear: () => Promise<void>;

  openEntry: (id: string) => void;
  toggleSelect: (id: string) => void;   // enforces max-2 (FIFO drop oldest)
  clearSelection: () => void;
  openDiff: () => void;                  // requires selectedIds.length === 2
  closeDiff: () => void;
}
```

Behaviour contract:
- **`load(activeRequestId, limit)`** — sets `loading`, resolves `requestId = scope === "request" ? activeRequestId : null`, calls `historyList(requestId, limit)`, stores `entries`, clears `error`; on reject sets `error` and `entries: []`, always clears `loading`. Called on drawer open and on scope change.
- **`refresh(activeRequestId)`** — same as `load` with the current `limit` after any send completes (the workbench calls it once `useSendRequest` reaches `success`/`error`, so a fresh row appears). Debounce not required; it's a single cheap IPC.
- **`clear()`** — calls `historyClear()`; on success resets `entries: []`, `selectedIds: []`, `openedId: null`, `diffOpen: false`; on reject sets `error`.
- **`toggleSelect(id)`** — if present, remove; else append; if that would exceed 2, drop the oldest (`selectedIds.shift()`) so the newest two are always compared. Selection ordinal (`A`=index 0, `B`=index 1) drives the row badge and the diff header.
- **`openDiff()`** — no-op unless exactly 2 selected; sets `diffOpen: true`.
- The store owns **no** derivation of diffs — `DiffPanel` computes them from the two selected `HistoryEntry` objects via the pure helpers (§5). This keeps the store thin and the diff logic unit-testable in isolation.

**Wiring points:**
- `HistoryTrigger` (statusbar) → `useHistoryStore.open()`; badge count = `entries.length` (or a lightweight last-known count).
- `RequestWorkbench` / the send hook → after a send settles, call `useHistoryStore.getState().refresh(activeRequestId)` so the drawer (if open) shows the new entry.
- Scope toggle disabled when `activeRequestId == null`; forcing `scope: "all"`.
- Escape / scrim click → `close()`; closing also `closeDiff()` but **preserves** `selectedIds` for the session (re-opening keeps the pair).

---

## 4. Replay — the redaction-aware behaviour (SECURITY-CRITICAL)

**Goal:** "run this past request again" without ever sending a redacted `•••` as a real credential.

### 4.1 What Replay does

Replay is offered on a `HistoryRow` (a `Replay` icon-button `i-replay`, `aria-label="Ponów request"`) and on the read-only preview header. It:

1. **Loads structure into the draft** via the existing `useRequestDraft` `importSpec` action (the same path `from_curl` uses — no new import code). Map `entry.request` (a `RequestSpec`) onto the **current** draft: `method, url, headers, query_params, body, auth, options ← entry.request`; keep the draft's identity fields (`id, collection_id, name, sort_order, docs_md, graphql`). Because history stores `query_params` structurally, no re-parse is needed (unlike the curl path); but if `query_params` is empty and the url carries a query, reuse `urlParams.ts::parseQuery` for parity.
2. **Detects redaction holes.** A pure helper `redactedFields(spec): RedactionHole[]` (new, `src/lib/replay.ts`) scans the imported spec for the literal `•••` sentinel and returns a list of holes:
   - `auth.bearer.token === "•••"`, `auth.basic.password === "•••"`, `auth.api_key.value === "•••"`
   - any `headers[i].value === "•••"` (with the header name)
   - any `query_params[i].value === "•••"` (with the param name)
   The sentinel is the exact string `•••` (three U+2022) — imported from a shared const so FE and the Rust `REDACTED` stay in lockstep. Body is never redacted, so it's excluded.
3. **Never auto-sends when holes exist.** Two-mode behaviour:
   - **No holes** (e.g. sig_v4, or a request with no secrets) → Replay may load-and-send in one step: `importSpec` then `useSendRequest.send(draft, activeEnvironmentId)`. This is the fast path and is safe — nothing sensitive was redacted.
   - **Holes present** → Replay **loads the draft but does NOT send**. It surfaces a **`ReplayReconcileBanner`** in the workbench (`role="status"`, `aria-live="polite"`) listing each hole: "Ten request pochodzi z historii — sekrety zostały zredagowane. Uzupełnij z aktualnego środowiska przed wysłaniem: `Authorization`, `X-Api-Key`." The user then either:
     - **Re-resolve from env** (recommended, default CTA): replace each `•••` value with the corresponding `{{secret.NAME}}` / `{{env.NAME}}` **template** so the normal `resolve_and_send` path re-fetches the live secret from Keychain in Rust. Where the original template name is recoverable (see §4.2) this is one click ("Uzupełnij z {{secret.…}}"); otherwise the field is highlighted for the user to type the template.
     - **Send anyway is refused for redacted fields.** The Send button's pre-flight guard (`hasRedactedSecrets(draft)`) blocks the send while any literal `•••` remains in a secret field and shows a tooltip "Nie wyślę zredagowanego sekretu (•••). Uzupełnij z env." This is a hard gate: **a `•••` value is never transmitted as a real credential.**

### 4.2 Recovering the template name (best-effort, optional)

History stores the *resolved-then-redacted* spec, so it knows `Authorization: •••` but not that it came from `{{secret.API_TOKEN}}`. Two ways to help the user re-fill without guessing:
- **Preferred:** if the active request draft (the live `StoredRequest` in `useCollectionsStore`) still has the original template for the same field, offer to copy that template into the replayed draft ("this request's stored version uses `{{secret.API_TOKEN}}` — use it?"). This is a pure client-side suggestion, no backend change.
- **Fallback:** leave the field empty/highlighted and prompt the user to pick a secret from the active environment's `secret_names` (already available via `useEnvStore.activeEnvironment().secret_names`) — inserting `{{secret.NAME}}`.

Either way the **value that eventually gets sent is a `{{template}}`, resolved live in Rust** — the FE never reconstructs a real secret and never sends `•••`.

### 4.3 Replay summary (the one-line contract)

> Replay loads `method / url / non-secret headers / non-secret params / body / options` from the chosen history entry into the draft. Redacted secret fields (`•••`) are **not** replayed as-is: the user re-supplies them as `{{secret.…}}` / `{{env.…}}` templates (auto-suggested from the live request or the active env), and only then does Send fire — resolving fresh secrets in Rust. If a request has no redacted fields, Replay can load-and-send immediately. The literal `•••` is **never** transmitted as a credential.

---

## 5. Response Diff

Two selected `HistoryEntry` objects, `A` (older selection index 0) vs `B` (index 1). All diff computation is **pure, framework-free, unit-tested** in `src/lib/`.

### 5.1 Structural JSON body diff — `src/lib/jsonDiff.ts`

```ts
export type JsonPath = string;                 // JSONPath-ish: "$", "$.a", "$.a.b[2]"
export type DiffKind = "added" | "removed" | "changed" | "type-changed";

export interface JsonDiffEntry {
  path: JsonPath;
  kind: DiffKind;
  before?: unknown;   // present for removed / changed / type-changed
  after?: unknown;    // present for added  / changed / type-changed
  beforeType?: string; // for type-changed (e.g. "number")
  afterType?: string;  // for type-changed (e.g. "string")
}

export function jsonDiff(before: unknown, after: unknown): JsonDiffEntry[];
export function parseJsonBody(body: string): { ok: true; value: unknown } | { ok: false; reason: string };
```

Algorithm (recursive, deterministic order):
- Parse each body with `parseJsonBody` (guards non-JSON / base64 / truncated bodies — if either side isn't parseable JSON, `DiffPanel` falls back to a **line/text diff** of the raw strings and flags "non-JSON body — textowy diff"). Respect `body_is_base64` / `body_truncated_at` on the `ResponseData` — don't try to JSON-parse a base64 or truncated body.
- Walk both trees by shared keys/indices, building JSONPath as you descend (`$`, `.key`, `[i]`).
  - key/index only in `after` → `added` (with `after`).
  - only in `before` → `removed` (with `before`).
  - present in both, both objects/arrays → recurse.
  - present in both, primitives, values differ:
    - same JS runtime type → `changed` (`before` + `after`).
    - **different type** (e.g. `number` → `string`, `object` → `array`, `null` → `object`) → `type-changed` (`before`, `after`, `beforeType`, `afterType`). Distinguishing `type-changed` from `changed` is an explicit requirement — surfaced with a distinct badge in the UI.
  - equal values → no entry.
- Type detection: a small `jsonType(v)` → `"null" | "boolean" | "number" | "string" | "array" | "object"` (arrays distinguished from objects). Arrays diff **positionally** by index in v1 (no LCS/move detection — keep it deterministic and cheap); document this as a known simplification.
- Output is a flat, sorted-by-path list so the UI can render stable rows and counts (`added` / `removed` / `changed+type-changed`).

### 5.2 Headers diff — `src/lib/jsonDiff.ts` (or `headersDiff` alongside)

Response headers are `KeyValue[]`. A dedicated `headersDiff(before: KeyValue[], after: KeyValue[]): HeaderDiffEntry[]`:
- Case-insensitive match by header name (HTTP header names are case-insensitive).
- `added` (only in B), `removed` (only in A), `changed` (present in both, value differs). No `type-changed` (all values are strings).
- Multi-value headers (same name twice) compare joined values in order; document as a v1 simplification.

### 5.3 Timing diff — `src/lib/timingDiff.ts`

```ts
export interface PhaseDelta {
  phase: "dns" | "connect" | "tls" | "ttfb" | "download" | "total";
  beforeMs: number;
  afterMs: number;
  deltaMs: number;     // after - before (positive = B slower)
  faster: boolean;     // deltaMs < 0
  pctChange: number | null; // (after-before)/before*100, null when before==0
}

export function timingDiff(before: Timings, after: Timings): PhaseDelta[];
```
- Reuse `src/lib/waterfall.ts::phaseSpans` to turn each side's **cumulative** `Timings` into per-phase durations (`dns, connect, tls, ttfb, download`), then diff phase-by-phase plus a `total` row from `total_ms`.
- `deltaMs = after - before`; `faster = deltaMs < 0`; `pctChange` guards divide-by-zero (`before === 0 → null`, render "—").
- Copy phrasing: for `total`, "B jest o **34 ms szybszy** (−19%)" / "o 12 ms wolniejszy (+8%)". `faster`/slower drives the color (green/red) and the arrow icon.

### 5.4 Diff UI

**`history/DiffPanel.tsx`** — `{ a: HistoryEntry; b: HistoryEntry; onClose: () => void }`. Computes the three diffs once (memoized) and renders header + tabs.

- **`DiffHeader`** — `A` / `B` chips (method + status + relative time from each entry, so the user knows which is which), a **split ⇄ unified** view toggle, and close ✕. `A` = older selection, `B` = newer, but label them by their **executed_at** ("A · 12 min ago", "B · just now") not by selection order, to avoid confusion.
- **`DiffTabs`** — `Body | Headers | Timing` with count chips (`added+removed+changed` per tab). `role="tablist"`, arrow-key nav, `aria-selected`, panels `role="tabpanel"`.
- **`JsonDiffView`** — renders `JsonDiffEntry[]`. **Split** = two mono columns (before | after) aligned by path; **unified** = one column with `+`/`−`/`~` gutter sigils. Each row: JSONPath (mono, `--lok-syn-key` tint), a **kind badge** (`Added` / `Removed` / `Changed` / `Type` ), and the value(s). `type-changed` shows `number → string` inline. Colors from tokens:
  - `added` → text `--lok-status-success`, bg `--lok-status-success-bg`, sigil `+`.
  - `removed` → text `--lok-status-danger`, bg `--lok-status-danger-bg`, sigil `−`.
  - `changed` / `type-changed` → "heat" treatment: text `--lok-heat-400`, bg `color-mix(in oklab, var(--lok-heat-500) 12%, transparent)`, sigil `~`; `type-changed` adds a small `Type` pill so it's distinct from a value-only change.
  - **Never color-only:** the sigil + badge text carry the meaning; screen readers get `aria-label` like "Dodano $.data.id: 42" / "Zmieniono typ $.count: number → string".
  - Empty diff → "Odpowiedzi identyczne (body)" state.
- **`HeadersDiffView`** — same added/removed/changed treatment over the KV list (no `type-changed`).
- **`TimingDiffView`** — one row per phase (+ total): phase label, `before ms`, `after ms`, `Δ ms` (tabular-nums, colored green if faster / red if slower / neutral if 0), `pctChange`. A tiny paired mini-waterfall (reuse `TimelineWaterfall` twice, A over B) is a nice-to-have, gated on time.

All numeric cells `.lok-tnums`. All bars/highlights are CSS → reduced-motion gate applies for free.

---

## 6. IPC — nothing new needed

`historyList(requestId, limit)` and `historyClear()` already exist in `src/lib/ipc.ts` and are registered in `lib.rs`. **No new commands.** `history_add` is engine-side and out of FE scope. Replay reuses `resolve_and_send` via `useSendRequest` (unchanged). Diff is pure client compute over data already fetched. This feature is **read + replay only** on the IPC surface — the sole mutation is `history_clear`.

---

## 7. Cross-cutting rules (applied to every component)

- **Shell:** `HistoryDrawer` is an overlay at `z-index: modal (1000)` with a scrim (`--lok-bg-overlay` + backdrop). Only `HistoryList` and `DiffPanel` bodies scroll (`.lok-scroll`, `min-height:0`); the drawer chrome is fixed. The drawer never grows the window; on close it unmounts and returns focus to `HistoryTrigger`.
- **A11y:**
  - Drawer is a `role="dialog"` `aria-modal="true"` `aria-labelledby` (its header); Escape + scrim close; **focus trap** while open; focus returns to the trigger on close.
  - Confirm-clear is `role="alertdialog"` with `aria-describedby` (the irreversible-warning copy).
  - Every icon-only button (Replay, Compare, Clear, close ✕, select checkbox) has an `aria-label`.
  - Status/method/diff-kind are **never color-only** — always paired with text (status reason, verb text, `+/−/~` sigil + kind badge).
  - Tabs (`DiffTabs`) `role="tablist"`/`tab`/`tabpanel`, arrow-key nav, `aria-selected`.
  - Live regions: load errors + the `ReplayReconcileBanner` use `aria-live="polite"`; the clear-confirm is `alertdialog`.
- **Reduced motion:** drawer slide-in (`--lok-dur-base`), row hover, diff highlight pulse are all CSS → the base.css hard gate collapses them. No JS-driven motion that bypasses the gate.
- **Tabular numbers:** status codes, `ms`, sizes, timing deltas, `pctChange` all `.lok-tnums` / `tabular-nums`.
- **Tokens only:** consume `--lok-*` (added=`--lok-status-success*`, removed=`--lok-status-danger*`, changed/type-changed=heat `--lok-heat-*` via `color-mix`). Never a hardcoded hex. Reuse existing class patterns (`.request-row.active` heat bar, `.kv` grid, `.resp-*`).
- **File size / structure:** each view < ~100 lines; all branching/derivation in hooks (`useHistoryStore`) and pure libs (`jsonDiff`, `timingDiff`, `replay`, `format`, `relativeTime`, `httpStatus`, `waterfall`). One component = one file.
- **Secrets:** the `•••` sentinel is a shared const; Replay's Send guard (`hasRedactedSecrets`) is a hard block; the FE never transmits `•••` as a credential and never reconstructs a real secret.

New/extended pure helpers (all unit-tested, no React/Tauri): `src/lib/jsonDiff.ts` (`jsonDiff`, `headersDiff`, `parseJsonBody`, `jsonType`), `src/lib/timingDiff.ts` (`timingDiff`), `src/lib/replay.ts` (`redactedFields`, `hasRedactedSecrets`, the `•••` sentinel + `importSpec` mapper). Reuse `format.ts`, `relativeTime.ts`, `httpStatus.ts`, `waterfall.ts`.

---

## 8. Test plan (Vitest + React Testing Library)

Mock the Tauri boundary: `vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`. Existing `src/test/setup.ts` (ResizeObserver + scrollIntoView stubs) covers CodeMirror/cmdk. Assert on **invoke command name + payload**, not internals.

### 8.1 Pure-helper unit tests (fast, no DOM)
- **`jsonDiff.test.ts`**
  - `added`: key only in `after` → one `{kind:"added", path:"$.b", after}`.
  - `removed`: key only in `before` → `{kind:"removed", path:"$.a", before}`.
  - `changed`: same type, different value → `{kind:"changed", before, after}`.
  - **`type-changed`**: `{n: 1}` vs `{n: "1"}` → `{kind:"type-changed", beforeType:"number", afterType:"string"}` (distinct from `changed`). Also `object→array`, `null→object`.
  - nested paths (`$.data.items[2].id`) resolve correctly; array positional diff.
  - identical bodies → `[]`.
  - `parseJsonBody`: valid JSON → ok; non-JSON / truncated → `ok:false` (so the view falls back to text diff).
  - `headersDiff`: case-insensitive match; added/removed/changed; identical → `[]`.
- **`timingDiff.test.ts`**
  - cumulative `Timings` → per-phase deltas via `phaseSpans`; `total` row from `total_ms`.
  - `deltaMs = after - before`; `faster` flag correct sign; B slower → positive delta, `faster:false`.
  - `pctChange`: normal case; `before === 0` → `null` (no divide-by-zero).
- **`replay.test.ts`**
  - `redactedFields`: bearer `•••`, basic password `•••`, api_key value `•••`, secret header `•••`, secret query `•••` all detected with correct paths/names; non-secret fields ignored; body ignored; sig_v4 (no `•••`) → no holes.
  - `hasRedactedSecrets`: true when any `•••` in a secret field, false otherwise.
  - `importSpec` mapping: `method/url/headers/query_params/body/auth/options` from entry; `id/collection_id/name/sort_order/docs_md/graphql` kept from draft.

### 8.2 `useHistoryStore` tests
- **`load` (scope=all)** invokes `("history_list", { requestId: null, limit: null })`; stores `entries`; clears `loading`/`error`.
- **`load` (scope=request)** invokes `("history_list", { requestId: <activeId>, limit: <limit> })` — filter passed through.
- **`load` reject** → `error` set, `entries: []`, `loading:false` (no throw).
- **`clear`** invokes `("history_clear", …)` once; on success `entries/selectedIds/openedId` reset, `diffOpen:false`; on reject `error` set.
- **`toggleSelect` max-2 FIFO**: selecting 3 keeps the newest two; deselect removes; `openDiff` no-op unless exactly 2.

### 8.3 Component render tests (RTL)
- **HistoryList render**: given 3 mocked entries, renders 3 rows with method badge, status (color by class, reason text present), relative time (`relativeTimeLabel`), `total_ms`, size — all present; tabular-nums cells.
- **Scope filter**: toggling to "This request" triggers `load` with the active request id; toggling to "All" triggers `load` with `requestId: null`. (Assert the two invoke payloads.)
- **Open entry → snapshot**: clicking a row passes `entry.response` to `ResponseDock` in snapshot mode; a "History · {relativeTime}" ribbon renders; no `resolve_and_send`/network invoke fires.
- **Replay loads draft WITHOUT sending a `•••` secret**: replaying an entry whose `auth` is bearer `•••` calls `importSpec` (draft updated with method/url/body) but **does not** invoke `("resolve_and_send", …)`; the reconcile banner lists the redacted field; `hasRedactedSecrets(draft)` blocks Send. Assert `invoke` was **never** called with `resolve_and_send` while a `•••` remains. (Secret-leak guard.)
- **Replay no-holes fast path**: replaying a sig_v4 (or secret-free) entry may load-and-send → `("resolve_and_send", { request, environmentId })` fired once with the imported spec.
- **Clear calls `history_clear` after confirm**: Clear → confirm dialog appears (`role="alertdialog"`); confirming invokes `("history_clear", …)` and empties the list; cancelling does **not** invoke it.
- **A11y smoke**: drawer is `role="dialog"`/`aria-modal`; icon-only buttons expose accessible names; DiffTabs expose `role="tab"` + `aria-selected`; diff rows expose sigils/labels (not color-only).

### 8.4 Diff view render tests
- **JsonDiffView**: given a `JsonDiffEntry[]` with one of each kind, renders added(green)/removed(red)/changed(heat) with `+/−/~` sigils and kind badges; `type-changed` shows `number → string` + a `Type` pill; counts per tab correct.
- **TimingDiffView**: renders per-phase + total rows; a faster total shows green + "szybszy"; slower shows red; `pctChange` "—" when before is 0.

---

## 9. Execution order for the coding agent

1. Pure helpers + tests: `jsonDiff.ts` (incl. `headersDiff`, `parseJsonBody`, `jsonType`), `timingDiff.ts`, `replay.ts` (sentinel, `redactedFields`, `hasRedactedSecrets`, `importSpec` mapper). Fast feedback, zero UI risk.
2. `useHistoryStore` + tests (mock `historyList`/`historyClear`).
3. `ResponseDock` snapshot-mode prop (optional `snapshot`) — smallest reuse hook; keep live path unchanged.
4. History drawer chrome: `HistoryDrawer` (dialog/focus-trap/scrim), `HistoryDrawerHeader` (scope toggle, Clear+confirm, close), `HistoryList` (loading/empty/error), `HistoryRow` (+ `HistoryRowMeta`), `HistoryTrigger` in the statusbar.
5. Replay path: `ReplayReconcileBanner` + Send pre-flight guard wiring (`hasRedactedSecrets`), template-recovery suggestion (best-effort).
6. Diff: `DiffPanel` (+ `DiffHeader`, `DiffTabs`), `JsonDiffView`, `HeadersDiffView`, `TimingDiffView`; split/unified toggle.
7. `yarn typecheck` + unit tests green; visual parity (both themes); no scrollable window; verify **no `resolve_and_send` fires while a `•••` secret remains** (the security gate).

**Definition of done:** typecheck clean, unit tests green, drawer overlays without a scrollable window, single-open previews the stored `ResponseData` read-only, Replay loads structure but **never sends `•••` as a credential** (holes reconciled to `{{templates}}` first; secret-free entries may load-and-send), `jsonDiff` distinguishes added/removed/changed/**type-changed**, `timingDiff` computes per-phase + total deltas with faster/slower + guarded `pctChange`, Clear is confirmed and calls `history_clear`, a11y + reduced-motion satisfied, diff is never color-only.
