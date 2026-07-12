# Command Palette (⌘K) · Import UI · Copy-as-cURL · Polish — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + cmdk + Tailwind v4 (utility-only) + design-system v2 (`--lok-*` tokens).
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored in `src/lib/types.ts`). **Never** invent a field.
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered commands) + `src/lib/ipc.ts` (typed wrappers). **Rust is unchanged by this feature** — every command below already exists.

This blueprint turns the current cosmetic ⌘K palette into a **real command surface**, adds a **first-class Import modal** (paste cURL / import file with auto-format-detection / scan shell history), promotes **Copy-as-cURL** to a toolbar button + palette action (always redacted), and closes four **polish** gaps (sidebar search padding, GraphQL double-toolbar, modal focus-traps, and reduced-motion/`100dvh`).

Hard rules that govern everything below (from `design-system/MASTER.md` §6 and repo feedback):

- **1 component = 1 file.** All logic in hooks; view files stay small and dumb. Types at module scope. Files ≤ ~100 lines (new files only).
- **Desktop shell:** `100dvh`, **no scrollable window** — only inner panes scroll (`overflow` on the panel, never `body`). Modals overlay; the shell underneath never gains scroll.
- **A11y non-negotiable:** `role="dialog"` + `aria-modal` on the Import modal; palette exposes `aria-activedescendant` (cmdk does this natively); `focus-visible` heat ring on every control; `aria-*` on every icon-only button; AA contrast (tokens already verified).
- **`prefers-reduced-motion` hard gate** (already enforced in `base.css` — all transitions collapse to `0.01ms`). No new motion escapes it.
- **Secrets never leave Rust for previews or Copy-as-cURL.** The FE **must not** call `to_curl`. Redaction is Rust's job: only `resolve_preview_curl` (redacted) is used for Copy-as-cURL and previews. `to_curl(spec, redact:false)` is **forbidden** in this feature.
- **File picker decision (no new plugin):** the repo ships **only** `@tauri-apps/plugin-opener`; there is **no** `dialog` or `fs` plugin. The Import "file" tab therefore uses a **`<textarea>` paste** surface (drop the file's text in) — no native file dialog, no new Tauri plugin, no new Rust permission. Rationale below (§2.b).
- **Clipboard decision (no new plugin):** Copy uses **`navigator.clipboard.writeText`** (WKWebView exposes the async Clipboard API in the app's secure context). No `@tauri-apps/plugin-clipboard-manager` is added. Fallback path documented in §3.

---

## 0. Existing state (what we build on, verified in-repo)

| Concern | Where it lives today | State |
|---|---|---|
| ⌘K palette view | `src/components/palette/CommandPalette.tsx` + `PaletteItem.tsx` + `palette.css` | Only 2 actions (New request, Toggle theme) + env list. **Extend.** |
| Palette open state | `useUiStore` (`paletteOpen`/`openPalette`/`closePalette`/`togglePalette`) | Reuse. |
| ⌘K hotkey | `src/hooks/usePaletteHotkey.ts` (`⌘K`/`Ctrl+K`) | Reuse. |
| Env switch | `useEnvStore.switchEnvironment(id)` → `setActiveEnvironment` IPC | Reuse. |
| Env manager modal | `useUiStore.openEnvManager()` → `EnvironmentManager.tsx` | Reuse (palette opens it). |
| History drawer | `useHistoryStore` + `HistoryDrawer` | Open via a UI flag (§1.4). |
| New request | `src/hooks/useNewRequest.ts` | Reuse. |
| Save / Send | `RequestWorkbench` `onSave`/`onSend` (⌘S / ⌘Enter already bound on the editor `onKeyDown`) | Lift to a shared **workbench-action bus** so the palette can call them (§1.5). |
| Redacted cURL | `resolvePreviewCurl` IPC + `useCurlPreview` hook | Reuse for Copy-as-cURL. |
| cURL import (inline) | `CurlTab.tsx` uses `fromCurl` → `importSpec` draft action | Reuse the exact path from the modal's Paste-cURL tab. |
| Importers | `importPostman`/`importInsomnia`/`importHar`/`importHttpFile` (all → `ImportResult`) + `scanShellHistoryCurls(limit)` | Wire into modal. |
| Persist imported tree | `useCollectionsStore` `upsert*` via `upsertCollection`/`upsertRequest` IPC | Reuse for "Save to collection". |
| Toast | **none exists** (`--lok-z-toast: 1200` token only) | **New** minimal toast (§3.3). |

`ImportResult` (from `models.rs` / `types.ts`) — **do not invent fields**:

```
ImportResult {
  collections:   Collection[]
  requests:      StoredRequest[]
  environments:  Environment[]
  warnings:      string[]     // e.g. "skipped pm.* pre-request script", "detected secret in header X"
}
```

---

## 1. ⌘K Command Palette — real actions

### 1.1 Design intent

The palette becomes the keyboard-first entry point (MASTER §6). It has **grouped**, **fuzzy-searchable** results with **visible shortcuts**, and each row calls the *same* store/IPC path the mouse UI uses — never a private re-implementation. cmdk already gives us fuzzy matching, `role="dialog"`, roving `aria-activedescendant`, and Esc/backdrop close; we lean on it rather than re-rolling a11y.

### 1.2 A pure action registry (the core new abstraction)

New file `src/lib/paletteActions.ts` — a **pure factory** that, given the live context, returns a flat list of `PaletteAction` descriptors. No React, no side effects at module scope; each action's `run` is a closure over the injected store/IPC calls. This keeps the view dumb and the actions unit-testable.

```ts
// src/lib/paletteActions.ts  (types + pure builder — no React import)
export type PaletteGroup = "Request" | "Environments" | "Tools" | "View";

export interface PaletteAction {
  id: string;                 // stable, for keys + aria + tests
  group: PaletteGroup;
  label: string;              // PL copy, matches app voice
  shortcut?: string;          // display only, e.g. "⌘N" — the real binding lives in usePaletteHotkey / editor onKeyDown
  keywords?: string[];        // extra fuzzy-match terms (e.g. ["curl","kopiuj"])
  disabled?: boolean;         // e.g. Save when !dirty, Copy/Send when no active request
  run: () => void;            // closure — calls store/ipc, then closes the palette (caller wraps close)
}

export interface PaletteContext {
  environments: Environment[];
  activeRequestPresent: boolean;
  dirty: boolean;
  // injected callables (all already exist in the app):
  newRequest: () => void;                 // useNewRequest()
  saveRequest: () => void;                 // workbench bus (§1.5)
  sendRequest: () => void;                 // workbench bus (§1.5)
  copyAsCurl: () => void;                  // §3 hook
  switchEnvironment: (id: string) => void; // useEnvStore
  openEnvManager: () => void;             // useUiStore
  openImport: () => void;                 // useUiStore (new flag §1.4)
  openHistory: () => void;                // useUiStore/useHistoryStore (§1.4)
  runBenchmark: () => void;               // workbench bus (§1.5)
  toggleTheme: () => void;                // useUiStore
}

export function buildPaletteActions(ctx: PaletteContext): PaletteAction[] { /* pure */ }
```

### 1.3 The action set (spec → wiring)

| Group | Action | Shortcut | Disabled when | Calls |
|---|---|---|---|---|
| Request | **Nowy request** | ⌘N | — | `useNewRequest()` |
| Request | **Zapisz request** | ⌘S | `!dirty` | workbench bus → `saveRequest(draft)` |
| Request | **Wyślij** | ⌘↵ | no active request or empty URL | workbench bus → `onSend()` |
| Request | **Kopiuj jako cURL** | ⌘⇧C | no active request | `useCopyAsCurl()` (§3) → `resolvePreviewCurl` (redacted) |
| Environments | **Przełącz środowisko → `{name}`** (one row per env) | — | — | `useEnvStore.switchEnvironment(env.id)` → `setActiveEnvironment` IPC |
| Environments | **Otwórz menedżer środowisk** | — | — | `useUiStore.openEnvManager()` |
| Tools | **Importuj…** | ⌘I | — | `useUiStore.openImport()` → Import modal (§2) |
| Tools | **Historia** | ⌘Y | — | `openHistory()` (§1.4) |
| Tools | **Uruchom benchmark** | — | no active request or empty URL | workbench bus → `onBenchmark()` |
| View | **Przełącz motyw** | — | — | `useUiStore.toggleTheme()` |

Notes:
- **Shortcuts are display-only in the palette.** The real key handlers stay where they are (`usePaletteHotkey` for ⌘K, editor `onKeyDown` for ⌘S/⌘Enter). New global bindings (⌘N, ⌘⇧C, ⌘I, ⌘Y) are added to `usePaletteHotkey` (renamed conceptually to a global-hotkeys hook, §1.6) so the palette's advertised shortcuts are truthful.
- **Env rows** are generated from `environments` — one `PaletteAction` per env, `group: "Environments"`, active env marked (checkmark/`aria-current` via `PaletteItem` `active` prop).
- **Disabled rows** render but are non-selectable (`aria-disabled`, cmdk `disabled` on `Command.Item`), so the user sees *why* nothing happens (e.g. Save is greyed until dirty).

### 1.4 New UI flags in `useUiStore`

Add to `UiState`:

```ts
importOpen: boolean;    openImport(): void;  closeImport(): void;
historyOpen: boolean;   openHistory(): void; closeHistory(): void;  // if history isn't already flag-driven; else reuse existing trigger
```

`historyOpen` mirrors the existing `HistoryTrigger`/drawer mechanism — if the drawer is already controlled by `useHistoryStore`, the palette action calls that instead of adding a flag (implementer verifies `statusbar/HistoryTrigger.tsx` first; prefer the existing path, add a flag only if none exists). **No duplicate open mechanism.**

### 1.5 Workbench action bus (so the palette can Save/Send/Benchmark the *live draft*)

The draft + send lifecycle live inside `RequestWorkbench` (local `useRequestDraft`/`useSendRequest`). The palette is mounted at `AppShell` level and can't reach that local state directly. Introduce a tiny **imperative bus** in a new store so the workbench *registers* its current callbacks and the palette *invokes* them:

New file `src/state/useWorkbenchActions.ts`:

```ts
interface WorkbenchActions {
  save: (() => void) | null;
  send: (() => void) | null;
  benchmark: (() => void) | null;
  copyCurl: (() => void) | null;
  canSave: boolean;   // = dirty
  canSend: boolean;   // = active request && url non-empty
  register: (a: Partial<WorkbenchActions>) => void;
  reset: () => void;
}
```

- `RequestWorkbench` calls `register({ save: onSave, send: onSend, benchmark: onBenchmark, copyCurl, canSave: dirty, canSend })` in a `useEffect` keyed on those callbacks, and `reset()` on unmount / when no active request.
- `CommandPalette` reads these to build `PaletteContext` (`saveRequest`, `sendRequest`, `runBenchmark`, `copyAsCurl`, `dirty`, `activeRequestPresent`).
- This keeps *all logic in the workbench* (single source of truth for the draft) and gives the palette a thin, testable handle. No prop-drilling through `AppShell`.

### 1.6 `CommandPalette.tsx` rewrite (view)

- Build `ctx: PaletteContext` from `useEnvStore`, `useUiStore`, `useWorkbenchActions`, `useNewRequest`.
- `const actions = buildPaletteActions(ctx)`; group with `groupBy(actions, a => a.group)`.
- Render `Command.Group` per group (heading order: Request → Environments → Tools → View), `PaletteItem` per action.
- `run = (action) => { action.run(); closePalette(); }` (guarded: no-op if `action.disabled`).
- `Command.Empty` → "Brak wyników".
- **A11y:** keep `Command.Dialog` (`label="Paleta poleceń"`, `role="dialog"` native). cmdk sets `aria-activedescendant` on the input and `aria-selected` on the active item automatically — **do not** hand-roll it; just ensure each `Command.Item` has a stable `value`/`key = action.id` so activedescendant is stable and testable.

`PaletteItem.tsx` gains an optional `active?: boolean` (for the current env → `aria-current="true"` + a heat check icon) and `disabled?: boolean` (→ `aria-disabled`, dimmed, `Command.Item disabled`). Shortcut `<kbd>` already renders.

### 1.7 Files touched (§1)

```
new   src/lib/paletteActions.ts              (pure registry + types)
new   src/state/useWorkbenchActions.ts       (imperative bus)
edit  src/state/useUiStore.ts                (importOpen/historyOpen flags)
edit  src/hooks/usePaletteHotkey.ts          (add ⌘N/⌘⇧C/⌘I/⌘Y global bindings)
edit  src/components/palette/CommandPalette.tsx
edit  src/components/palette/PaletteItem.tsx  (active/disabled)
edit  src/components/workbench/RequestWorkbench.tsx (register bus)
```

---

## 2. Import UI — modal with three tabs

### 2.0 Shell

New `src/components/import/ImportModal.tsx` — mounted in `AppShell` next to `EnvironmentManager`, visible when `useUiStore.importOpen`. It **copies the EnvironmentManager modal contract exactly** (proven in-repo): `role="dialog"`, `aria-modal="true"`, `aria-label="Importuj"`, backdrop mousedown-outside closes, `Esc` closes, focus moves to the modal on open and **returns to the invoking control** on close, plus a real **focus-trap** (§4.c — env modal only focuses the card; we upgrade the shared trap and both modals use it).

Tabs use the existing `common/TabBar.tsx`. Tab keys: `"Wklej cURL" | "Importuj plik" | "Skanuj historię"`. All import logic sits in a hook `src/hooks/useImport.ts`; the modal and its tab views are dumb.

`useImport.ts` state machine:

```ts
type ImportStage =
  | { kind: "idle" }
  | { kind: "running" }                    // an import_* / from_curl / scan is in flight
  | { kind: "result"; result: ImportResult } // file import → show preview + warnings + Save
  | { kind: "error"; message: string };
```

### 2.a Tab — Paste cURL → `from_curl` → draft

- A `<textarea>` (mono, `--lok-*` tokens) + **Importuj** button (identical to today's `CurlTab` import surface — reuse that exact interaction).
- On import: `fromCurl(command)` → `RequestSpec`. Two placement options, offered as a small choice:
  - **Load into current draft** — dispatch `importSpec` on the active workbench draft via the workbench bus (add `importSpec` to `useWorkbenchActions`) → identical to `CurlTab`'s `onImport`.
  - **New request from cURL** — `useNewRequest()` then apply the spec to the fresh draft (bus `importSpec`). Default when no active request.
- Success → close modal, toast "Zaimportowano z cURL". Error → inline `aria-live="polite"` red line (mirror `CurlTab`).
- **No `ImportResult` here** — `from_curl` returns a single `RequestSpec`, not `ImportResult`. Do not fabricate a warnings list for this tab.

### 2.b Tab — Import file (format auto-detect → correct `import_*` → ImportResult preview)

**File source = paste text** (per the file-picker decision): a large `<textarea>` labelled "Wklej zawartość pliku (Postman / Insomnia / HAR / .http)". No native dialog, no new plugin.

> **Why paste, not a native dialog:** the repo has no `dialog`/`fs` Tauri plugin and adding one means a new npm dep + a new `tauri.conf.json` capability/permission + Rust command surface — out of scope for a FE-only, Rust-unchanged feature, and it widens the attack surface (arbitrary FS read). Paste keeps the importer 100% in existing IPC (`import_*` already take a **string**), stays testable with plain RTL, and works on `file://`. If a native picker is ever wanted, it's a separate, additive task (add `@tauri-apps/plugin-dialog` + capability, then only swap how the string is obtained — the detect→import→preview→save pipeline below is unchanged).

**Format detection** — new pure `src/lib/importFormat.ts`:

```ts
export type ImportFormat = "postman" | "insomnia" | "har" | "http" | "unknown";
export function detectImportFormat(text: string): ImportFormat;
```

Detection heuristics (cheap, order matters, from the file formats' own signatures):

1. Try `JSON.parse`. If it throws → treat as **`.http`** iff it looks like an HTTP file (first non-comment/non-empty line matches `^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S`) else **`unknown`**.
2. On a parsed object:
   - Postman v2.1 → `obj.info?.schema` contains `"schema.getpostman.com"` **or** `obj.info && Array.isArray(obj.item)` → **`postman`**.
   - HAR → `obj.log?.entries` is an array (and `obj.log.version`) → **`har`**.
   - Insomnia v4 → `obj._type === "export"` && `obj.__export_format` (typically 4) && `Array.isArray(obj.resources)` → **`insomnia`**.
   - else **`unknown`**.

Dispatch by format → the matching IPC:

| Format | IPC | arg |
|---|---|---|
| `postman` | `importPostman(json)` | raw text |
| `insomnia` | `importInsomnia(json)` | raw text |
| `har` | `importHar(json)` | raw text |
| `http` | `importHttpFile(text)` | raw text |
| `unknown` | — (no call) | show "Nie rozpoznano formatu…" |

The detected format is shown as a chip **before** import ("Wykryto: Postman v2.1") so the user can confirm; an override `<select>` lets them force a format if detection is wrong (defensive — malformed exports happen).

**Preview `ImportResult`** — `ImportResultPreview.tsx` (dumb):
- Counts: `{n} kolekcji · {m} requestów · {k} środowisk` (tabular nums).
- A tree/list of `result.collections` → their `result.requests` (grouped by `collection_id`), each request row = `MethodBadge` + name + URL host.
- **Warnings block (prominent, `--lok-status-warn`)** — render `result.warnings` verbatim as a list, `aria-live="polite"`, icon + label (never color-only). These carry the security-relevant notes: **skipped `pm.*` scripts** and **detected secrets** (the Rust importers emit them). The block is styled as a warn callout, not hidden.
- **"Zapisz do kolekcji" button** — enabled only when `result` has ≥1 collection or request.

**Save to collection** — new `useImport.persist(result)`:
- For each `result.collections` → `useCollectionsStore` upsert (via `upsertCollection` IPC) preserving `parent_id`/`sort_order` (the importer already set the tree shape — **do not re-parent**).
- For each `result.requests` → `upsertRequest` IPC (preserving `collection_id`).
- Environments in `result.environments` → offer (checkbox) to also import via `upsertEnvironment`; default off (env import is opt-in, keeps secrets/names out unless asked).
- Persist collections **before** requests (FK-ish: a request references its `collection_id`). Sequence: `for (col of collections) await upsertCollection(col); for (req of requests) await upsertRequest(req);` then `useCollectionsStore.load()` (or optimistic merge) to refresh the sidebar. On any failure → keep the modal open, toast the error, do **not** partially claim success.
- Success → toast "Zaimportowano {m} requestów do {n} kolekcji", close modal, select the first imported request.

### 2.c Tab — Scan shell history → `scan_shell_history_curls` → pick → `from_curl` → draft

- On tab open (or a "Skanuj" button), `scanShellHistoryCurls(limit)` (default `limit = 200`) → `string[]` of raw curl commands.
- Render as a selectable list (`ScanHistoryList.tsx`, dumb): each row = the curl one-liner (mono, truncated, `title` = full), with the leading verb parsed for a `MethodBadge` (best-effort; unknown → no badge). Empty result → EmptyState "Brak curli w historii" (macOS `~/.zsh_history` etc. — Rust decides source; FE just renders).
- Select a row → `fromCurl(command)` → `RequestSpec` → same placement choice as §2.a (current draft or new request). Close modal + toast.
- **Never** auto-execute a scanned curl; only load it into a draft. (Security: shell history can contain live tokens — loading into the redacted-aware draft is safe; sending is an explicit, separate user action.)

### 2.d Files (§2)

```
new  src/components/import/ImportModal.tsx        (dialog shell + TabBar + stage switch)
new  src/components/import/PasteCurlTab.tsx        (textarea + placement choice)
new  src/components/import/ImportFileTab.tsx       (textarea + detect chip + override select)
new  src/components/import/ImportResultPreview.tsx (counts + tree + WARNINGS block)
new  src/components/import/ScanHistoryTab.tsx      (scan + selectable list)
new  src/components/import/ScanHistoryList.tsx     (dumb list rows)
new  src/components/import/import.css              (tokens-only, mirrors env.css)
new  src/hooks/useImport.ts                        (stage machine + detect+dispatch+persist)
new  src/lib/importFormat.ts                       (pure detectImportFormat)
edit src/components/AppShell.tsx                   (mount <ImportModal/>)
edit src/state/useWorkbenchActions.ts              (add importSpec handle)
```

---

## 3. Copy-as-cURL — button in RequestBar + ⌘K action

### 3.1 Path (never leaks secrets)

```
click "Kopiuj cURL"  ─▶  useCopyAsCurl(draft, environmentId)
                          └▶ resolvePreviewCurl(draft, environmentId)   // Rust interpolates env + REDACTS secrets → "•••"
                             └▶ navigator.clipboard.writeText(redactedCurl)
                                └▶ toast "Skopiowano cURL (sekrety zredagowane)"
```

- **Only `resolve_preview_curl`.** It is the redacted path (secrets → `•••`, per `ipc.ts` doc + `models`). `to_curl(spec, false)` (unredacted) is **never** called by this feature — enforced in review and by a test that asserts the copied string equals the `resolvePreviewCurl` mock output and contains no raw secret value.
- New hook `src/hooks/useCopyAsCurl.ts`:

```ts
export function useCopyAsCurl(draft: StoredRequest, environmentId: string | null) {
  const toast = useToast();
  return useCallback(async () => {
    try {
      const curl = await resolvePreviewCurl(draft, environmentId); // redacted in Rust
      await writeClipboard(curl);                                   // navigator.clipboard, fallback in §3.4
      toast.show("Skopiowano cURL — sekrety zredagowane", "success");
    } catch (e) {
      toast.show("Nie udało się skopiować", "danger");
    }
  }, [draft, environmentId, toast]);
}
```

### 3.2 RequestBar button

- Add a copy icon-button to `RequestBar.tsx` (between Save and Benchmark), `aria-label="Kopiuj jako cURL"`, `title="Kopiuj jako cURL (⌘⇧C)"`, `<Icon name="i-copy" />`, disabled when `draft.url.trim() === ""`.
- Also shown in the **GraphQL toolbar** path is *not* duplicated — Copy lives in the single unified toolbar after the polish in §4.b (see there). GraphQL requests copy the same way (`resolve_preview_curl` handles the POST body).
- `RequestWorkbench` provides `copyAsCurl` to the bar (from `useCopyAsCurl(draft, activeEnvironmentId)`) and registers it on the workbench bus so ⌘K's "Kopiuj jako cURL" and ⌘⇧C use the identical closure.

### 3.3 Toast (new, minimal)

- New `src/components/common/Toast.tsx` + `src/state/useToast.ts` (zustand) + `toast.css`. One transient toast at a time (or a tiny stack), `--lok-z-toast: 1200`, auto-dismiss ~2.4s, `role="status"` / `aria-live="polite"` (success) or `role="alert"` (danger), variants map to `--lok-status-*`. Mounted once in `AppShell`.
- Reduced-motion: entrance is an opacity swap only (the global `base.css` gate already collapses transforms).

### 3.4 Clipboard fallback

- `src/lib/clipboard.ts` → `writeClipboard(text)`:
  1. `if (navigator.clipboard?.writeText)` → use it (primary; works in WKWebView secure context).
  2. else fallback: hidden `<textarea>` + `document.execCommand("copy")` (legacy, still available in WKWebView) → resolve/reject accordingly.
- **No** `@tauri-apps/plugin-clipboard-manager` dependency added (keeps the plugin surface unchanged; documented as the escalation path if `navigator.clipboard` proves unavailable at runtime).

### 3.5 Files (§3)

```
new  src/hooks/useCopyAsCurl.ts
new  src/lib/clipboard.ts
new  src/components/common/Toast.tsx
new  src/state/useToast.ts
new  src/components/common/toast.css
edit src/components/workbench/RequestBar.tsx   (copy button)
edit src/components/workbench/RequestWorkbench.tsx (wire copyAsCurl + register on bus)
edit src/components/AppShell.tsx               (mount <Toast/>)
```

---

## 4. Polish

### 4.a Sidebar search placeholder padding

**Symptom:** placeholder text sits flush-left, the `i-search` icon overlaps it.

**Root cause:** `SidebarHeader.tsx` uses the search icon absolutely positioned at `left-2` (~8px) with `<Icon size={14}>`, but the input's left padding is `pl-7` (28px). The icon glyph plus its intrinsic box can render wider than 20px, and `type="search"` adds a UA decoration/clear affordance on WebKit that eats horizontal space — the net effect is the placeholder/caret starting under the icon.

**Fix (CSS, tokens-only):**
- Set input left padding to a token-clean `padding-left: var(--lok-space-8)` (32px) — comfortably clears a 14px icon at `left: var(--lok-space-2)` (8px) + a 4px gap.
- Neutralize WebKit search chrome: `input[type="search"]::-webkit-search-decoration, ::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }`.
- Move these to `sidebar.css` as a `.sidebar-search` class (replacing the ad-hoc inline `pl-7`/Tailwind), so the icon offset and input padding are defined together and stay in sync. Keep the icon at `left: var(--lok-space-2)`, vertically centered.
- Verify caret + placeholder start to the **right** of the icon with a ≥4px gap.

### 4.b GraphQL "double toolbar / duplicated URL"

**Symptom:** in GraphQL Explorer mode there are **two** toolbars and **two** URL inputs.

**Root cause (confirmed in code):** `RequestWorkbench.tsx` always renders `<RequestBar>` (which contains `<UrlInput>`), *and then* — when `isGraphql` — also renders `<GraphqlExplorer>`, whose `<ExplorerToolbar>` **also** contains a `<UrlInput>` (plus its own Run button). Two toolbars, two URL fields, two run affordances.

**Fix (single coherent toolbar — do not render both):**
- When `draft.graphql != null`, **do not render the REST `RequestBar`'s URL/method/Send stack**. The GraphQL explorer already owns its toolbar (`ExplorerToolbar`: OperationPicker + URL + RefreshSchema + Run). Keep exactly one.
- **But** the request-type toggle (REST ⇄ GraphQL) and the new **Copy-as-cURL** + **Save** controls must remain reachable in GraphQL mode. Two clean options; pick **Option A** (least churn, keeps one toolbar row):
  - **Option A (recommended):** In GraphQL mode, `RequestWorkbench` renders **only** `GraphqlExplorer`, and passes the shared controls *into* `ExplorerToolbar` as props: the `requestTypeToggle` node, plus `onSave`/`dirty`/`onCopyCurl`. `ExplorerToolbar` renders `[type-toggle] [OperationPicker] [UrlInput] [RefreshSchema] [Save] [Copy] [Run]` — one row, no duplication. `RequestBar` is REST-only.
  - **Option B:** Keep `RequestBar` as the single toolbar for both modes; when GraphQL, it hides Method (already does) and hides its own Send in favor of a Run wired to the explorer, and `GraphqlExplorer` drops `ExplorerToolbar` entirely (renders only the 3-column grid + statusbar). More surgery on the explorer; not preferred.
- **Chosen: Option A.** Concretely: guard in `RequestWorkbench` — `isGraphql ? <GraphqlExplorer .../> : (<><RequestBar/><RequestTabs/>...</>)`. Move the `requestTypeToggle` and Save/Copy props from `RequestBar` into `ExplorerToolbar` for the GraphQL branch. Net: **exactly one toolbar, one URL input, one Run/Send** in each mode.
- Regression guard: a test asserts that in GraphQL mode there is exactly **one** URL `textbox` and **one** toolbar (`role="toolbar"` or the `.toolbar` container count).

### 4.c Modal focus-trap (fill the gap)

- `EnvironmentManager` today only `focus()`es the card on open — **no Tab-cycle trap** and it relies on the card being `tabIndex={-1}`. Tab can escape to the shell behind it.
- New shared hook `src/hooks/useFocusTrap.ts` (`ref`, `active`, `onClose`, `returnFocusTo`):
  - On activate: record `document.activeElement`, focus the first focusable descendant (or the container).
  - `keydown` Tab/Shift+Tab cycles within the container's focusable set (query `a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])`); wrap at ends.
  - `Escape` → `onClose`.
  - On deactivate: restore focus to the recorded element (`returnFocusTo`).
- Apply to **both** `ImportModal` (new) and `EnvironmentManager` (retrofit — replace its ad-hoc focus effect). The palette already gets this from cmdk; no change there.

### 4.d 100dvh / no window scroll / reduced-motion (audit + hold the line)

- Confirm the app shell root uses `height: 100dvh` (or `svh`/`dvh`) and `overflow: hidden` on `body`/root; the new modals overlay (`position: fixed; inset: 0`) and their internal scroll is on `.import-modal-body` / result tree (`overflow: auto`, `overscroll-behavior: contain`), never the body.
- The Import result tree and scan list scroll internally only.
- All new motion (toast, modal entrance) inherits the global `prefers-reduced-motion` collapse from `base.css`; no new `@keyframes` bypasses it, and none use `transform` that would jump under reduced motion (opacity swaps only).

### 4.e Files (§4)

```
edit src/components/sidebar/SidebarHeader.tsx  (use .sidebar-search class)
edit src/components/sidebar/sidebar.css        (.sidebar-search padding + webkit search reset)
edit src/components/graphql/ExplorerToolbar.tsx (accept type-toggle/save/copy props)
edit src/components/graphql/GraphqlExplorer.tsx  (pass through the shared controls)
edit src/components/workbench/RequestWorkbench.tsx (isGraphql ? explorer-only : rest branch)
new  src/hooks/useFocusTrap.ts
edit src/components/env/EnvironmentManager.tsx  (adopt useFocusTrap)
```

---

## 5. A11y, reduced-motion, 100dvh (consolidated non-negotiables)

- **Palette:** `role="dialog"` (cmdk), fuzzy input labelled, `aria-activedescendant` native, visible `<kbd>` shortcuts, Esc/backdrop close, focus returns to trigger. Disabled actions `aria-disabled`, active env `aria-current`.
- **Import modal:** `role="dialog"` + `aria-modal="true"` + `aria-label`, real focus-trap (§4.c), Esc close, tab list is a `TabBar` with `role="tablist"`/`tab`/`tabpanel`; format chip + warnings `aria-live="polite"`; warnings never color-only (icon + text).
- **Copy toast:** `aria-live="polite"` (success) / `role="alert"` (error); auto-dismiss; dismissible.
- **Reduced motion:** every new animation collapses via the existing `base.css` gate; opacity-only entrances.
- **100dvh:** shell never scrolls; only `.import-modal-body`, result tree, scan list, palette list scroll internally (`overscroll-behavior: contain`).
- **Icons:** Lucide inline via `<Icon>`; every icon-only button has `aria-label`; method/env/status carry icon **and** label.

---

## 6. Test plan (Vitest + RTL, `vi.mock("@tauri-apps/api/core")`)

All tests mock `invoke` (pattern already used in `RequestWorkbench.test.tsx`) and, where needed, `navigator.clipboard.writeText` (spy). Test setup (`src/test/setup.ts`) already stubs `ResizeObserver`/`scrollIntoView` for cmdk. New files get co-located `*.test.tsx`.

### 6.1 Command palette — actions run the real paths
- `paletteActions.test.ts` (pure): `buildPaletteActions(ctx)` returns the expected groups/ids; **New/Save/Send/Import/Copy/Benchmark/Toggle theme** present; one env row per environment; Save `disabled` when `!dirty`; Copy/Send `disabled` when `!activeRequestPresent`; each action's `run` calls the injected callable (spy) exactly once.
- `CommandPalette.test.tsx`:
  - "Nowy request" → `useNewRequest` effect (new active request in store).
  - "Zapisz request" → workbench-bus `save` spy called.
  - "Przełącz środowisko → Prod" → `invoke("set_active_environment", { id })` called with that env id (via `switchEnvironment`).
  - "Importuj…" → `useUiStore.importOpen === true` (modal opens).
  - "Kopiuj jako cURL" → `resolve_preview_curl` invoked (§6.3 asserts redaction).
  - Palette exposes `role="dialog"`; typing filters (fuzzy) down to matching rows (`aria-activedescendant` moves).

### 6.2 Copy-as-cURL — never exposes real secrets
- `useCopyAsCurl.test.ts` / `RequestBar.test.tsx`:
  - Mock `invoke("resolve_preview_curl", …)` → returns a **redacted** string containing `•••` and **not** the real secret value (`"SUPER_SECRET_TOKEN"`).
  - Assert `navigator.clipboard.writeText` was called with **exactly** that redacted string.
  - Assert the copied text **does not contain** the raw secret (regex / `expect(copied).not.toContain("SUPER_SECRET_TOKEN")`).
  - Assert `to_curl` was **never** invoked (`expect(mockInvoke).not.toHaveBeenCalledWith("to_curl", expect.anything())`).
  - Success → toast rendered with `role="status"`.

### 6.3 Import — format detection + correct importer
- `importFormat.test.ts` (pure): Postman v2.1 fixture → `"postman"`; Insomnia v4 → `"insomnia"`; HAR → `"har"`; `.http` text → `"http"`; garbage → `"unknown"`; malformed JSON that looks like `.http` → `"http"`.
- `ImportFileTab.test.tsx`:
  - Paste Postman JSON → detect chip shows "Postman"; click Import → `invoke("import_postman", { json })` called (and **not** the other importers).
  - Paste HAR → `invoke("import_har", …)`; `.http` → `invoke("import_http_file", { text })`.
  - Mocked `ImportResult` with `warnings: ["Pominięto skrypt pm.*", "Wykryto sekret w nagłówku Authorization"]` → preview renders both counts and the **warnings block** (both strings visible, `aria-live`).
  - "Zapisz do kolekcji" → `upsert_collection` then `upsert_request` invoked (collections before requests), order asserted.
- `PasteCurlTab.test.tsx`: paste curl → `invoke("from_curl", { command })` → workbench-bus `importSpec` spy called with the returned `RequestSpec` (draft updated).

### 6.4 Scan history render
- `ScanHistoryTab.test.tsx`:
  - Mock `invoke("scan_shell_history_curls", { limit })` → `["curl https://a.test", "curl -X POST https://b.test"]`.
  - List renders both rows (mono, method badge best-effort).
  - Click a row → `invoke("from_curl", { command })` with that exact string → placement (bus `importSpec`) called; modal closes.
  - Empty array → EmptyState "Brak curli w historii".

### 6.5 Polish
- `SidebarHeader.test.tsx`: search input has the `.sidebar-search` class and computed/asserted left padding ≥ the icon offset + gap (assert the class is applied and `type="search"` present; visual padding covered by the class in `sidebar.css`). At minimum assert the icon and input coexist with the icon marked `aria-hidden` and the input `aria-label="Szukaj requestów"`.
- `GraphqlDoubleToolbar.test.tsx` (or extend `RequestWorkbench.test.tsx`): seed a `graphql != null` request → assert **exactly one** URL `textbox` in the workbench and **exactly one** toolbar container; assert the REST `RequestBar` URL input is **absent** and the request-type toggle + Save + Copy are present in the single (explorer) toolbar.
- `useFocusTrap.test.tsx`: with the trap active, Tab from the last focusable wraps to the first; Shift+Tab from the first wraps to the last; Escape calls `onClose`; on deactivate focus returns to the recorded trigger.

### 6.6 Local gate (CI is billing-blocked — verify locally)
GitHub Actions won't run (billing). The gate is **local**:
```
npm run typecheck   # tsc --noEmit — zero errors
npm run test:unit   # vitest run — all green, incl. the new specs above
```
Run both in the worktree after `npm ci`. Do not claim done with TS errors or red tests (repo rule).

---

## 7. Execution order (for the coding agent)

1. **Bus + registry (pure, no UI):** `useWorkbenchActions`, `paletteActions.ts`, `importFormat.ts`, `clipboard.ts`, `useToast`/`Toast` — all unit-tested first.
2. **Palette wiring:** `useUiStore` flags, hotkeys, `CommandPalette`/`PaletteItem`, register bus in `RequestWorkbench`.
3. **Copy-as-cURL:** `useCopyAsCurl`, RequestBar button, toast wiring, secret-leak test.
4. **Import modal:** `useImport`, modal + 3 tabs + result preview + scan list, mount in `AppShell`.
5. **Polish:** sidebar search CSS, GraphQL single-toolbar (Option A), `useFocusTrap` on both modals, 100dvh/reduced-motion audit.
6. **Local gate:** `npm run typecheck && npm run test:unit` → green.

---

## 8. Key decisions (summary)

| Decision | Choice | Why |
|---|---|---|
| Import file source | **Textarea paste** (no native dialog) | No `dialog`/`fs` plugin in repo; keeps feature FE-only + Rust-unchanged; importers already take a string; smaller attack surface. Native picker = separate additive task. |
| Copy-to-clipboard | **`navigator.clipboard.writeText`** + `execCommand` fallback | WKWebView secure-context Clipboard API; avoids adding `plugin-clipboard-manager`. |
| Copy redaction | **Only `resolve_preview_curl`** (Rust redacts) | Hard secret-leak gate; `to_curl(…, false)` forbidden; asserted by test. |
| Palette ↔ workbench draft | **Imperative bus store** (`useWorkbenchActions`) | Palette is shell-level; draft is workbench-local. Keeps all draft logic in the workbench, palette stays thin/testable. |
| Format detection | **Pure `detectImportFormat`** by each format's own signature | Deterministic, unit-testable; user-visible chip + manual override for bad exports. |
| GraphQL toolbar | **Option A** — GraphQL renders only its explorer; shared controls injected into `ExplorerToolbar` | Removes the duplicate `RequestBar` URL/toolbar; one coherent toolbar per mode. |
| Focus trap | **Shared `useFocusTrap`** on Import + Env modals | Env modal lacked a real trap; DRY + a11y. |
