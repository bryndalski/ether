# Architecture Blueprint — Rebrand "Lokówka" → "Ether" + i18n (EN default, PL available)

> **Status:** blueprint (design, not implementation).
> **Author:** senior architect.
> **Scope:** two independent-but-coordinated workstreams — **(A) Rebrand** to *Ether* and **(B) i18n** with **English as the default** language and Polish available.
> **Stack:** Tauri v2 + React 19 + Vite + Zustand + Tailwind v4; Rust backend (libcurl engine, SQLite, macOS Keychain).
> **Icon:** the spiral / coil mark **stays** — it reads as an "ether spiral" / a request arc "into the void" just as well as a curl.

---

## 0. Brand thesis (the "why" that guides every string)

| Old ("Lokówka") | New ("Ether") |
|---|---|
| Curling iron; heat/"hot = on"; magenta→amber heat ramp | The **void / aether**; "glow in the void", dark-OLED; a single glow escaping darkness |
| "curl under the hood" pun (lokówka = curls) | "**requests into the void — nothing escapes**"; 100% local, nothing leaves the machine |
| Polish-first name | English-first product (name is already English/neutral) |

The **coil/spiral icon survives the reframe**: it now reads as a spiral drawn in the void / the arc of a request that leaves and returns. **Do not redraw the mark for this change.** Renaming the *heat ramp* language in BRAND.md is out-of-scope beyond swapping the product name and one-line thesis; a full visual re-theme ("glow in the void" OLED palette) is a **separate follow-up epic** — this blueprint touches copy + identifiers only, so the diff stays reviewable.

---

## PART A — REBRAND SCOPE

### A.1 Exhaustive change list (identifiers & copy)

| # | File | Field / token | From | To | Class |
|---|---|---|---|---|---|
| A1 | `src-tauri/tauri.conf.json` | `productName` | `"Lokówka"` | `"Ether"` | app metadata |
| A2 | `src-tauri/tauri.conf.json` | `identifier` | `"com.bryndalski.lokowka"` | `"com.bryndalski.ether"` | **bundle id (see A.3)** |
| A3 | `src-tauri/tauri.conf.json` | `app.windows[0].title` | `"Lokówka"` | `"Ether"` | window chrome |
| A4 | `src-tauri/tauri.conf.json` | `bundle.shortDescription` / `longDescription` | "Lokówka is a local-first…" | Rewrite for Ether ("Ether is a local-first API client… requests go into the void, nothing escapes your machine.") | store copy |
| A5 | `src-tauri/Cargo.toml` | `package.description` | "Lokówka — a fully local API client…" | "Ether — a fully local API client for macOS with curl under the hood" | crate metadata |
| A6 | `src-tauri/Cargo.toml` | `package.name` / `[lib].name` | `lokowka` / `lokowka_lib` | **DECISION: keep** (see A.2) | crate identity |
| A7 | `src-tauri/src/secrets.rs` | `const SERVICE` | `"com.bryndalski.lokowka"` | `"com.bryndalski.ether"` | **Keychain namespace (see A.4)** |
| A8 | `src-tauri/src/engine.rs` (~L300) | Application-Support dir segment | `"com.bryndalski.lokowka"` | `"com.bryndalski.ether"` | **on-disk data dir (see A.4)** |
| A9 | `src-tauri/src/store.rs` (~L46) | DB filename | `"lokowka.db"` | `"ether.db"` *(or keep — see A.4)* | **SQLite file (see A.4)** |
| A10 | `src-tauri/src/engine.rs` | env override `LOKOWKA_DATA_DIR` | — | add `ETHER_DATA_DIR` (keep `LOKOWKA_DATA_DIR` as alias) | dev/test override |
| A11 | `package.json` | `name` | `"lokowka"` | `"ether"` | npm package |
| A12 | `index.html` | `<title>` | `Lokówka` | `Ether` | web shell |
| A13 | `index.html` | `<html lang="pl">` | `pl` | `en` | **default locale (ties to Part B)** |
| A14 | `src/components/topbar/Wordmark.tsx` | rendered wordmark text | `Lokówka` | `Ether` (via i18n key `brand.name`, see B) | UI |
| A15 | `README.md` | full rewrite: title, tagline, "Why" table, pun line | "Lokówka 🔥 / curling iron" | "Ether / requests into the void" | docs |
| A16 | `design-system/brand/BRAND.md` | mark name + thesis line | "Lokówka — Brand Mark" | "Ether — Brand Mark" (note coil re-reading; heat-ramp palette rename deferred) | brand docs |
| A17 | `.github/workflows/release.yml` (~L42) | artifact `name: lokowka-dmg` | `lokowka-dmg` | `ether-dmg` | CI artifact label |
| A18 | `src/lib/paletteActions.ts`, toasts, aria-labels | any user-visible "Lokówka" | — | route through i18n (Part B) | UI |

> **Explicitly out of scope (do NOT change):** the `lok-*` CSS class prefix (`lok-heat-gradient`, `lok-palette-empty`, …) appears across **94 files** and is a **namespace, not branding** — renaming it is a huge, risky, purely-cosmetic churn with zero user-facing value. Keep `lok-`. Likewise internal test fixtures like `x-from: lokowka` in `resolve.rs` are arbitrary test values — leave them. Deep-link scheme (`ether://`) is **not implemented yet** → nothing to change.

### A.2 DECISION — Rust crate rename (`lokowka`/`lokowka_lib` → `ether`/`ether_lib`)?

**Decision: KEEP the crate names `lokowka` / `lokowka_lib` internally.** Do **not** rename the crate.

**Rationale / risk:**
- The crate name is **never user-visible** — the app the user sees is driven by `productName`, window `title`, and the Wordmark, all of which we *do* rebrand. Renaming the crate is pure internal cosmetics.
- A rename touches at least: `Cargo.toml` (`package.name`, `[lib].name`), `main.rs` (`lokowka_lib::run()`), `tests/engine_http.rs` (`use lokowka_lib::…`), and regenerates `Cargo.lock`. Each is a place to break the build for **zero user benefit**.
- The Rust community norm is that crate/lib names are snake_case internal identifiers decoupled from marketing names (cf. `ripgrep` crate `grep`, Tauri apps commonly keep the scaffold name). Divergence here is idiomatic, not a smell.
- **If the user later insists on a full rename**, it is a mechanical follow-up: rename both `Cargo.toml` names → replace `lokowka_lib` with `ether_lib` in `main.rs` + `tests/engine_http.rs` → `cargo build` to regenerate the lock. Isolate it in its own commit so bisect stays clean.

**What we DO change in Rust** (user-facing / data-facing only): `secrets.rs` SERVICE, `engine.rs` data dir + env override, `store.rs` DB name, `Cargo.toml` `description`.

### A.3 Bundle identifier change (`identifier`)

Changing `identifier` from `com.bryndalski.lokowka` → `com.bryndalski.ether` makes macOS treat it as a **new application**: new Application-Support container, new TCC/permission grants, new code-signing identity scope, and the OS will not "upgrade" an installed Lokówka in-place. **This is acceptable and correct now** because the product is pre-release (v0.1.0, no shipped users) — doing it later would strand real user data. **Flag prominently in the changelog:** any local dev build of Lokówka installed on a machine will co-exist as a separate app; its data won't auto-migrate (see A.4).

### A.4 ⚠️ DATA-NAMESPACE MIGRATION — the load-bearing warning

The brand string is baked into **three on-disk/keychain namespaces**, not one. All three move when we rebrand, and **all three orphan existing local data**:

1. **Keychain** — `secrets.rs::SERVICE = "com.bryndalski.lokowka"`. New value `com.bryndalski.ether` = a **new Keychain service**; secrets stored under the old service become invisible to the app (not deleted — just unreferenced).
2. **Application Support dir** — `engine.rs::data_dir()` joins `com.bryndalski.lokowka`. This directory holds the **SQLite database and per-scope cookie jars**. New segment = a fresh empty data dir → collections/requests/environments/history appear wiped.
3. **DB filename** — `store.rs` opens `lokowka.db` inside that dir.

**Decision & guidance:**
- Because the app is **pre-release with no real users**, doing this migration-free reset **now is the right call and the cheapest moment** — exactly as flagged in the task. **Land the rebrand before any public release.**
- **Recommendation to minimize churn:** change the two **directory/service** namespaces (Keychain SERVICE + Application-Support segment) to `com.bryndalski.ether`, but **keep the DB filename `lokowka.db` OR rename to `ether.db`** — either is fine since the whole parent dir is new anyway; renaming to `ether.db` is tidier and recommended for consistency (A9).
- **Do NOT write a data-migration shim** (copy old Keychain/dir → new) for a pre-release app — it's dead code the day it ships. If the user wants dev continuity on their own machine, document a one-time manual `mv ~/Library/Application\ Support/com.bryndalski.lokowka … com.bryndalski.ether` in the changelog rather than shipping migration code.
- **MUST appear in `docs/architecture/rebrand-i18n.md` changelog + PR body + README "Development" note:** "Rebrand relocates the Keychain service and the on-disk data directory. Existing local Lokówka data will not appear in Ether; re-create dev data or move the folder manually."

---

## PART B — INTERNATIONALIZATION (i18n)

### B.1 DECISION — library vs zero-dep

**Decision: custom, dependency-free, typed dictionary + a tiny `useT()` hook.** Do **not** add `react-i18next` / `i18next`.

**Rationale:**
- **Local-first / minimal-deps is a product principle** (README Principle 1; the app fights Electron bloat). Adding i18next (+ `react-i18next`, +ICU if we want plurals) is ~40–60 KB and a plugin ecosystem for an app with **exactly two languages and a flat, developer-oriented string set**. That contradicts the brand.
- The string surface is **simple**: labels, aria-labels, a handful of `${...}`-interpolated strings, and a couple of pluralized counts. No RTL, no lazy-loaded locale bundles, no server rendering, no gender/case grammar engine needed. A typed dictionary covers 100% of it in <60 lines of infra.
- **Type safety for free:** `en.ts` is the source of truth; `pl.ts` is typed as `typeof en` so a missing/renamed key is a **compile-time error** (caught by `npm run typecheck`) — stronger than i18next's runtime-missing-key behavior.
- Zustand is already the state layer; language selection + persistence slots in with **zero new runtime deps**.
- **Escape hatch:** the `t(key, vars)` signature is deliberately i18next-shaped (`t('sidebar.search')`, `t('import.done', { requests, collections })`), so if the app ever needs 6+ locales or ICU plurals, swapping the impl for `react-i18next` is a localized change behind the same call sites — not a rewrite.

### B.2 File & folder structure

```
src/
  i18n/
    en.ts            # source of truth; DEFAULT locale; nested namespaces
    pl.ts            # typed as `typeof en` (compile-time completeness)
    index.ts         # locale registry, type Locale, dictionaries map, default = 'en'
    useT.ts          # useT() hook -> returns t(key, vars); subscribes to locale
    interpolate.ts   # pure {var} / plural helper (unit-tested in isolation)
    useT.test.ts     # unit tests (default EN, switch PL, missing-key fallback, interpolation)
```

### B.3 Dictionary shape & key conventions

- **Nested object, dotted access.** Namespaces mirror the component areas discovered in the inventory (§B.6):
  `common`, `brand`, `sidebar`, `topbar`, `statusbar`, `workbench`, `auth`, `body`, `params`, `headers`, `graphql`, `stream`, `response`, `timeline`, `history`, `diff`, `devtools`, `env`, `secrets`, `import`, `palette`, `toast`, `assertions`, `watch`, `snapshot`, `a11y`.
- **Key naming:** `namespace.camelCaseAction` — e.g. `sidebar.searchRequests`, `sidebar.newRequest`, `workbench.send`, `response.timeline`, `common.save`, `common.cancel`, `env.title`, `palette.searchPlaceholder`, `import.pasteCurlTab`, `history.clearAll`.
- **Reuse via `common.*`** for cross-cutting verbs (`save`, `cancel`, `delete`, `close`, `rename`, `noResults`, `copy`, `moveUp`, `moveDown`) — the inventory shows "Zapisz/Usuń/Anuluj/Zamknij/Kopiuj" repeated in many files; they live once under `common`.
- **a11y strings are first-class keys** under `a11y.*` (or co-located, e.g. `sidebar.searchAria`) — aria-labels/titles are NOT hardcoded; the inventory shows many `aria-label="Szukaj requestów"` / `title="Historia requestów"` that MUST be translated.
- **English is authored first** (default), Polish translated from it — flipping the current author-order (today strings are Polish).

Example (`en.ts`, abridged):

```ts
export const en = {
  brand: { name: 'Ether', tagline: 'Requests into the void — nothing escapes.' },
  common: { save: 'Save', cancel: 'Cancel', delete: 'Delete', close: 'Close',
            rename: 'Rename', copy: 'Copy', moveUp: 'Move up', moveDown: 'Move down',
            noResults: 'No results' },
  sidebar: { searchRequests: 'Search requests…', searchAria: 'Search requests',
             addAria: 'Add a collection or request', newRequest: 'New request' },
  workbench: { send: 'Send', sendAria: 'Send request',
               noAuth: 'Request sent without authorization.' },
  palette: { title: 'Command palette', searchPlaceholder: 'Search requests, actions, env…' },
  import: { pasteCurlTab: 'Paste cURL', importFileTab: 'Import file',
            scanHistoryTab: 'Scan history',
            done: 'Imported {requests} requests into {collections} collections',
            parseFailed: 'Could not parse cURL.' },
  env: { title: 'Environments', manageAria: 'Manage environments',
         deleteConfirm: 'Delete environment “{name}”?' },
  response: { title: 'Response', sending: 'Sending request…',
              pressSend: 'Press Send and watch the waterfall',
              emptyHint: 'Response, headers and timeline will appear here.' },
  history: { clearAll: 'Clear all history', clearConfirm: 'Clear all history? This cannot be undone.' },
  a11y: { openPalette: 'Open command palette', openHistory: 'Open history' },
  // …
} as const;
export type Dict = typeof en;
```

`pl.ts`:
```ts
import type { Dict } from './en';
export const pl: Dict = { brand: { name: 'Ether', tagline: 'Requesty w pustkę — nic nie ucieka.' }, /* … full parallel tree … */ };
```

> **Note:** `brand.name` is `'Ether'` in **both** locales (a proper noun is not translated); only surrounding copy is localized. This is why the Wordmark reads `t('brand.name')` rather than a hardcoded string — single source of truth for the product name.

### B.4 Runtime, interpolation, plurals

- **`index.ts`** exports `type Locale = 'en' | 'pl'`, `const DEFAULT_LOCALE: Locale = 'en'`, and `const dictionaries: Record<Locale, Dict> = { en, pl }`.
- **`interpolate.ts`** — pure function: replaces `{name}` tokens from a `vars` object; numbers formatted with `new Intl.NumberFormat(locale).format(n)` when passed via a numeric var so PL/EN group-separators are correct. A minimal `plural(locale, n, { one, other })` helper covers the few counted strings (`{requests} requests`, "Brak przebiegów", history counts) using `Intl.PluralRules` — still zero deps (built-in `Intl`).
- **`useT.ts`** — reads `locale` from the store (§B.5), returns `t(key: DotPath<Dict>, vars?)`:
  - Resolves the nested key against the active dictionary.
  - **Missing-key fallback:** if the key is absent in the active locale (shouldn't happen thanks to the `typeof en` typing, but defensive at runtime), fall back to **`en`**, then to the **key string itself** — never render blank. This is the tested fallback contract.
  - Component usage: `const t = useT(); … <button aria-label={t('workbench.sendAria')}>{t('workbench.send')}</button>`.
  - Interpolation: `t('import.done', { requests, collections })`.

### B.5 Language selection, switch & persistence

- **State:** add a `locale: Locale` + `setLocale(locale)` slice. Two options; **recommendation: extend `useUiStore`** (it already owns theme, sidebar, dock — language is a sibling UI preference) rather than a new store, keeping preference state in one place.
- **Persistence (IMPORTANT — current gap):** `useUiStore` today has **no persistence middleware** (theme/locale reset on reload). Introduce **`zustand/middleware` `persist`** (built into the already-installed `zustand` — zero new dep) on a small persisted subset `{ theme, locale }`, keyed to `localStorage` under `ether.ui`. (Tauri's WKWebView localStorage is per-app-container, so it correctly scopes to the new `com.bryndalski.ether` container.) A future upgrade path is the Tauri `store` plugin for a real on-disk JSON file, but localStorage is sufficient and dep-free now.
- **Initial locale resolution order:** persisted `localStorage` value → (optional) `navigator.language.startsWith('pl') ? 'pl' : 'en'` → **`DEFAULT_LOCALE = 'en'`**. English wins by default when nothing is persisted and the heuristic is off; the language auto-detect is **opt-in** and can be omitted to keep "EN default, always" literal — recommend shipping **EN-hard-default, no auto-detect** for v1 to match the directive exactly, and revisit detection later.
- **Switcher UI = ⌘K command palette** (matches the app's "⌘K for everything" principle). Add palette actions in `src/lib/paletteActions.ts`:
  - `Language: English` (keywords `language`, `english`, `język`, `en`) → `setLocale('en')`
  - `Language: Polski` (keywords `language`, `polski`, `polish`, `pl`) → `setLocale('pl')`
  - These action labels themselves come from i18n (`palette.languageEnglish` / `palette.languagePolish`), and the palette shows a check/active marker on the current locale.
- Optionally surface a tiny locale toggle in the status bar later; the palette is the canonical entry for v1.

### B.6 String inventory → translation plan (areas, files, key namespaces)

Grep of `src/**/*.tsx|ts` (excluding tests) for Polish diacritics found **~70 files** carrying UI text; below is the **area map** with representative strings and target namespaces. (Counts are diacritic-line counts, a proxy for string volume — total user-visible strings ≈ **200–260** across ≈70 files.) Every user-visible string AND aria-label/title migrates to a key.

| Area | Files (representative) | Sample PL strings (→ EN) | Namespace |
|---|---|---|---|
| **Sidebar** | `SidebarHeader`, `RequestRow`, `Sidebar`, `TreeGroup`, `InlineRename`, `RowContextMenu` | "Szukaj requestów…", "Dodaj kolekcję lub request", "Zmień nazwę", "Przenieś w górę/dół", "Usuń" | `sidebar.*`, `common.*` |
| **Topbar** | `Wordmark`, `CommandHint`, `EnvDropdown`, `EnvPill`, `EnvQuickLook`, `TitleBar` | "Lokówka"→brand.name, "Otwórz paletę poleceń" | `brand.*`, `topbar.*`, `a11y.*` |
| **Status bar** | `StatusBar`, `HistoryTrigger` | "Otwórz historię", "Historia requestów", health/env status | `statusbar.*`, `a11y.*` |
| **Workbench** | `SendButton`, `AuthForm`, `AuthField`, `BodyPanel`, `BodyEditor`, `BodyModeSelect`, `HeadersPanel`, `ParamsPanel`, `KeyValueTable`, `MultipartTable`, `RequestWorkbench`, `MethodSelect` | "Wyślij request", "Request wysyłany bez autoryzacji.", "Użytkownik/Hasło/Wartość/Usługa" | `workbench.*`, `auth.*`, `body.*`, `params.*`, `headers.*` |
| **GraphQL** | `DocsBreadcrumb`, `DocsExplorer`, `FieldTreeNode`, `HeadersPanel`, `OperationVarsPanel`, `RefreshSchemaButton`, `RunButton`, `StreamEventList`, `StreamStatusBar` | schema/docs labels, "Odśwież schemat", run/subscribe states | `graphql.*`, `stream.*` |
| **Response / Timeline** | `ResponseDock`, `ResponseBody`, `ResponseHeaders`, `ResponseTabs`, `TimelineWaterfall`, `VerboseLog`, `StatusBadge` | "Odpowiedź", "Wysyłam request…", "Naciśnij Send i zobacz waterfall", empty-state hints | `response.*`, `timeline.*` |
| **History / Diff** | `HistoryDrawerHeader`, `HistoryList`, `HistoryRow`, `CompareBar`, `DiffHeader`, `DiffTabs`, `HeadersDiffView`, `JsonDiffView`, `TimingDiffView`, `ReplayReconcileBanner` | "Wyczyść (całą) historię", "Usunąć całą historię? Tej operacji nie można cofnąć.", diff tab labels | `history.*`, `diff.*`, `common.*` |
| **DevTools** | `BenchmarkLauncher/Panel/Stats`, `CertCard/Panel`, `JwtClaimsView/PasteDecoder/SourcePicker`, `LatencyHistogram`, `TlsSummary` | benchmark/JWT/TLS labels & units | `devtools.*` |
| **Environments** | `EnvironmentManager`, `EnvList`, `EnvMeta`, `VariablesTable`, `ConfirmDialog` | "Środowiska", "Zarządzanie środowiskami", "Wybierz lub utwórz środowisko…", "Usunąć środowisko „{name}"?" | `env.*` |
| **Secrets** | `SecretNamesList`, `SecretStatusBadge`, `SetSecretDialog` | Keychain messaging, "Sekretów nie usuwa się automatycznie z Keychain." | `secrets.*` |
| **Import** | `ImportModal`, `PasteCurlTab`, `ImportFileTab`, `ScanHistoryTab`, `ScanHistoryList`, `ImportResultPreview` | "Wklej cURL", "Importuj plik", "Skanuj historię", "Nie udało się sparsować cURL.", "Zaimportowano {requests} requestów do {collections} kolekcji" | `import.*` |
| **Palette** | `CommandPalette`, `PaletteItem`, `src/lib/paletteActions.ts` | "Paleta poleceń", "Szukaj requestów, akcji, env…", "Brak wyników", "Wyślij", "Przełącz środowisko → {name}", "Przełącz motyw", "Otwórz menedżer środowisk" | `palette.*` |
| **Toasts / feedback** | `Toast.tsx` + call-sites in stores/hooks (`useCopyAsCurl`, `useToast`, `useWorkbenchActions`) | copy/import/error toasts | `toast.*` |
| **Assertions / tests** | `src/lib/assertions.ts`, `assertionDefaults.ts`, `WatchPanel`, `WatchRunRow`, `SnapshotToolbar`, `SnapshotView` | "nagłówek {name} istnieje", "brak nagłówka {name}", "body nie jest JSON…", "wyłączone", "Watch aktywny…", "Brak przebiegów…" | `assertions.*`, `watch.*`, `snapshot.*` |
| **Empty states / common** | `EmptyState`, `MethodBadge`, `HealthDot`, `TabBar` | shared empty-state copy | `common.*` |

**Migration order (recommended, low-risk → visible-first):**
1. Land i18n infra (`src/i18n/*`, `useUiStore` persist + `locale`, palette actions) with only `common.*` + `brand.*` + `palette.*` wired — proves the pipe, switch works, Wordmark shows "Ether".
2. High-traffic surfaces: sidebar, topbar, statusbar, workbench, response, palette.
3. Modals/drawers: env, import, history/diff, secrets, devtools.
4. Long-tail: assertions/watch/snapshot lib strings, all remaining aria-labels/titles.

Each step is independently shippable; a component is "done" only when it has **no remaining hardcoded UI text or aria-label** (enforce via a `typecheck` pass + a diacritics grep that should trend to zero for `.tsx` render text).

---

## PART C — TEST PLAN

### C.1 i18n unit tests (`src/i18n/useT.test.ts`, `interpolate.test.ts`)
1. **Default is EN:** with a fresh store (no persisted locale), `t('workbench.send') === 'Send'`.
2. **Switch to PL:** `setLocale('pl')` → `t('workbench.send') === 'Wyślij'` (rerender reflects new locale).
3. **Missing-key fallback:** requesting an EN-only / bogus key returns the **EN value** if present, else the **key string** — never `undefined`/blank.
4. **Interpolation:** `t('import.done', { requests: 3, collections: 2 })` → `'Imported 3 requests into 2 collections'` (and PL parallel).
5. **Number formatting:** a numeric var renders with the locale's `Intl.NumberFormat` grouping (EN `1,000` vs PL `1 000`).
6. **Plural helper:** `plural('en', 1, …)` → "1 request", `plural('en', 5, …)` → "5 requests" (+ PL forms).
7. **Parity/completeness:** a test asserting `pl` has exactly the same key set as `en` (belt-and-suspenders alongside the `typeof en` compile guard).

### C.2 Rebrand tests
1. **`tauri.conf.json`** — a small config assertion (JSON parse in a vitest or a shell check in the local gate): `productName === 'Ether'`, `identifier === 'com.bryndalski.ether'`, `app.windows[0].title === 'Ether'`.
2. **`secrets.rs`** — Rust test asserting the namespace: update `entry_construction_does_not_touch_keychain` fixture to use an `ether-*` name and add an assert that `SERVICE == "com.bryndalski.ether"` (a `const`-level test). The existing ignored round-trip test's fixture names → `ether-test-secret`.
3. **`engine.rs`** — assert `data_dir()` (with no env override) ends in `com.bryndalski.ether`; keep/extend the `LOKOWKA_DATA_DIR`/`ETHER_DATA_DIR` override test.
4. **Grep gate:** CI/local check that no **user-visible** "Lokówka"/"Lokowka" remains outside `lok-` CSS classes, test fixtures, and lockfiles.

### C.3 Smoke (`src/test/smoke.test.ts`)
- App renders with `AppShell` in **EN by default**: assert a stable EN string is present (e.g. the Send button / palette hint), and the Wordmark renders `Ether`.
- After `setLocale('pl')` + rerender, the same anchor renders its Polish equivalent.

### C.4 Local gate (CI is billing-blocked)
Run in the **worktree**, always with a real install (never symlink `node_modules`):
```sh
cd /tmp/lok-rebrand
npm ci
npm run typecheck        # catches missing/renamed i18n keys via `pl: Dict`
npm run test:unit        # vitest: i18n + rebrand config + smoke
cd src-tauri
cargo test               # secrets/engine namespace asserts
cargo clippy --all-targets -- -D warnings
```

---

## PART D — ROLLOUT / SEQUENCING

1. **Commit 1 (this):** `docs(architecture): rebrand+i18n blueprint`.
2. **Commit 2 — rebrand identifiers:** tauri.conf, Cargo.toml description, secrets/engine/store namespaces, package.json, index.html, release.yml, README, BRAND.md. Isolated so the data-namespace move is a single reviewable diff.
3. **Commit 3 — i18n infra:** `src/i18n/*`, `useUiStore` `persist` + `locale`, palette language actions, Wordmark → `t('brand.name')`. Tests green.
4. **Commits 4…N — string migration** by area (§B.6 order), each keeping `typecheck` + `test:unit` green.
5. **(Deferred epic)** full "glow in the void" OLED visual re-theme + `ether://` deep-link scheme + optional `navigator.language` auto-detect.

---

## Appendix — Decisions at a glance

| Question | Decision | Why |
|---|---|---|
| Rename Rust crate `lokowka_lib`→`ether_lib`? | **No (keep)** | Internal, never user-visible; rename = pure churn/build-break risk. Mechanical follow-up if demanded. |
| i18n library? | **Custom typed dict + `useT()`, zero deps** | Local-first/minimal-deps principle; only 2 locales; compile-time key completeness; i18next-shaped `t()` keeps escape hatch. |
| Default language? | **English, hard default** (no auto-detect in v1) | Directive; `index.html lang="en"`, `DEFAULT_LOCALE='en'`. |
| Language switcher? | **⌘K palette** (`Language: English/Polski`) + Zustand `persist`→localStorage `ether.ui` | Matches "⌘K for everything"; fixes current no-persistence gap. |
| Keychain / data dir? | **Move to `com.bryndalski.ether`, no migration shim** | Pre-release = cheapest moment; shim would be dead code. Documented manual move for dev continuity. |

---

## Changelog — implementation (2026-07-13)

Blueprint implemented end-to-end on branch `feat/rebrand-ether-i18n`.

**Rebrand (Part A):** `tauri.conf.json` productName/identifier/window-title → **Ether** / `com.bryndalski.ether`; store copy rewritten; `Cargo.toml` `description` → Ether (crate name `lokowka`/`lokowka_lib` **kept** per A.2); `secrets.rs` `SERVICE` → `com.bryndalski.ether`; `engine.rs` data-dir segment → `com.bryndalski.ether` **and** new `ETHER_DATA_DIR` override with the legacy `LOKOWKA_DATA_DIR` alias retained; `store.rs` DB file → `ether.db`; `package.json` name → `ether`; `index.html` `<title>Ether` + `lang="en"`; README + BRAND.md rebranded; `release.yml` artifact → `ether-dmg`.

**⚠️ Data-namespace move (A.4):** the rebrand relocates **both** the macOS Keychain service and the on-disk Application-Support directory to `com.bryndalski.ether`, and renames the SQLite file to `ether.db`. Existing local **Lokówka** data will **not** appear in **Ether** — re-create dev data, or move the folder manually once:
`mv ~/Library/Application\ Support/com.bryndalski.lokowka ~/Library/Application\ Support/com.bryndalski.ether`.
No migration shim was shipped (pre-release; would be dead code).

**i18n (Part B):** zero-dependency typed dictionary under `src/i18n/` (`en.ts` source-of-truth + default, `pl.ts` typed as `Dict`, `interpolate.ts`, `index.ts` registry, `useT.ts` hook). `useUiStore` gained `locale` + `setLocale` and a `persist` middleware persisting `{ theme, locale }` to `localStorage` under `ether.ui`. Language switch lives in the ⌘K palette (`Language: English` / `Language: Polski`). **English is the hard default** (no auto-detect). Every user-visible string and aria-label across sidebar, topbar, statusbar, workbench, response/timeline, graphql, subscriptions, history/diff, devtools, env, secrets, import, palette, toasts, assertions/watch/snapshot was migrated to keys; store-level default entity names (collection/request/environment) resolve via the active locale. Result: **no visible Polish under EN**; PL renders fully after switching.

**Local gate (CI billing-blocked):** `npm run typecheck` clean, `npm run test:unit` 383/383 (incl. 17 i18n/rebrand tests), `cargo test` 191/191 (incl. new `data_dir_*` + `service_namespace_is_ether`), `cargo clippy --all-targets -- -D warnings` clean, `cargo build` compiles.
