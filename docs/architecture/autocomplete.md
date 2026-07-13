# Autocomplete Everywhere — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + CodeMirror 6 (`@codemirror/autocomplete` `^6.20`, `cm6-graphql` `^0.2`) + design-system v2 (`--lok-*` tokens).
> **Brand:** Ether (`brand.name` in `src/i18n/en.ts`). **i18n:** EN is the default + source of truth (`src/i18n/en.ts`); `pl.ts` is typed `typeof en`.
> **Contract source of truth (variables/dynamic grammar):** `src-tauri/src/interp.rs` — the `{{...}}` engine. **Never** invent a namespace or function the interpolator does not resolve.
> **Env source of truth:** `src/state/useEnvStore.ts` + `src/lib/envMerge.ts` (`MergedVar { name, value, isSecret, source }`).
> **Visual pattern:** the CodeMirror completion tooltip is restyled onto `--lok-*` tokens (there is no bespoke dropdown component today; the ⌘K palette `src/components/palette/*` is the a11y reference).

The user reported: **there is no automatic suggestion of variables or schema anywhere.** Today the URL, Params and Headers fields are plain `<input>` (`UrlInput.tsx`, `KeyValueTable.tsx`); `BodyEditor`, `QueryEditor` and `VariablesPanel` are CodeMirror 6 but ship **no `{{...}}` completion**. `cm6-graphql` IS already wired to the introspected schema in `QueryEditor` (schema autocomplete works when a schema is loaded), but nothing offers `{{env.X}}`, `{{secret.X}}`, `{{$uuid}}`, or header names.

This blueprint adds **one shared token-completion engine** used identically in every editable field, plus GraphQL-schema confirmation and header-name/value suggestions — with zero new interpolation grammar.

Hard rules that govern everything below (from `design-system/MASTER.md` §6 and repo feedback):
- **1 component = 1 file; logic in hooks; types at module scope.** The pure candidate builder is a plain module with no React/CM imports.
- **Secrets: names only, never values.** `{{secret.NAME}}` is suggested by **name**; the completion payload carries **no secret value** and the store's secret values never enter the candidate list. This mirrors `interp.rs::preview_template`, which masks every secret.
- **A11y non-negotiable:** the completion popup is a `listbox`/`option` pattern (CM6 provides the ARIA + `aria-activedescendant`); keyboard arrows/Enter/Esc; `prefers-reduced-motion` collapses the fade; the popup must not occlude the caret line.
- **No CDN, no new heavy dep.** Everything is built on the already-installed `@codemirror/autocomplete`.

---

## 1. The shared variable-suggestion source (pure, reused everywhere)

### 1.1 Where the candidate list comes from

A single pure builder produces the ordered candidate list. It has **no knowledge of CodeMirror or React** so it is unit-testable in isolation and reused by both the CM completion source and (if we ever add one) any non-CM surface.

**File:** `src/lib/completion/variableCandidates.ts`

```
export type CandidateKind = "env" | "secret" | "dynamic" | "runvar";

export interface VarCandidate {
  /** The full token INCLUDING braces, e.g. "{{env.host}}", inserted verbatim. */
  insert: string;
  /** Namespaced label shown in the popup, e.g. "env.host", "$uuid". */
  label: string;
  kind: CandidateKind;
  /** Short EN detail line, e.g. resolved-preview for env, "secret" for secrets,
   *  a signature for dynamic fns. NEVER a secret value. */
  detail: string;
  /** Sort weight — lower first. */
  boost: number;
}

export interface CandidateSources {
  vars: MergedVar[];              // useEnvStore.mergedActiveVars()  (public vars + secret-name rows)
  runVarNames?: string[];         // optional {{var.NAME}} namespace — omit when unavailable
}

export function buildVariableCandidates(src: CandidateSources): VarCandidate[];
```

**Composition (in this priority order):**

1. **Env public variables** — from `MergedVar[]` where `!isSecret`. `label = "env." + name`, `insert = "{{env." + name + "}}"`, `detail =` the *masked-if-long-but-otherwise-plain* current value (this is a **public** var; showing its value is fine and useful), `kind:"env"`, highest boost.
2. **Secret names** — from `MergedVar[]` where `isSecret` (secret-only rows already surface in `mergedVars` with `value:""`). `label = "secret." + name`, `insert = "{{secret." + name + "}}"`, `detail = t("autocomplete.secretDetail")` (the literal word "secret" — **never** a value), `kind:"secret"`. Guarantee: the builder reads `MergedVar.name` only for secrets; `MergedVar.value` is already `""` for secret rows, but the builder must **not** copy `value` into `detail` for `isSecret` candidates even if some future store leaks it. Test enforces this.
3. **Dynamic functions** — a **static table** that mirrors `interp.rs` exactly (the only source of truth). `kind:"dynamic"`:

   | insert | label | detail (EN, from i18n) |
   |---|---|---|
   | `{{$uuid}}` | `$uuid` | "random UUID v4" |
   | `{{$timestamp}}` | `$timestamp` | "Unix seconds" |
   | `{{$timestamp_ms}}` | `$timestamp_ms` | "Unix milliseconds" |
   | `{{$datetime.iso}}` | `$datetime.iso` | "ISO-8601 / RFC-3339 now" |
   | `{{$random.int(a,b)}}` | `$random.int(a,b)` | "random integer in [a,b]" |
   | `{{$random.hex(n)}}` | `$random.hex(n)` | "n random bytes, hex" |
   | `{{$base64(text)}}` | `$base64(…)` | "base64-encode text" |

   For the two argument-taking calls, `insert` places the caret between the parens via a CM **snippet** (see §1.3) — e.g. `{{$random.int(${1:0},${2:9})}}`.
   This table lives in one const `DYNAMIC_FUNCTIONS` so a future `interp.rs` addition is a one-line diff; a doc-comment points back to `src-tauri/src/interp.rs::resolve_dynamic`.
4. **Run-vars `{{var.NAME}}`** — the workflow/scripts namespace (`interp.rs` `var.` prefix, see `docs/architecture/workflow-editor.md` §2.3). **Only** emitted when `runVarNames` is provided and non-empty; in the plain Request Workbench (no run context) it is omitted, so we never suggest a token that would resolve to nothing. `label = "var." + name`, `insert = "{{var." + name + "}}"`, `kind:"runvar"`.

The builder returns candidates already de-duplicated by `insert` and sorted by `boost` then `label`.

### 1.2 The reusable CodeMirror completion source

**File:** `src/lib/completion/variableCompletion.ts`

```
import { CompletionSource } from "@codemirror/autocomplete";
export function variableCompletionSource(
  getCandidates: () => VarCandidate[],
): CompletionSource;
```

**Trigger + matching logic (the core UX contract):**

- Fires when the text immediately left of the caret contains an **open, unclosed** `{{` — i.e. a `{{` with no closing `}}` between it and the caret. Regex against the line before the caret: `/\{\{\s*([\w.$()]*)$/`. The captured group is the **prefix** the user has typed after `{{` (may be empty right after typing `{{`).
- `from` = position of the char right after `{{` (so accepting a candidate replaces the partial token, not the braces the user typed). Because each candidate's `insert` **includes** its own `{{…}}`, the completion `apply` also removes the user's leading `{{`: the range replaced spans **from the `{{`** through the caret, and the inserted text is the full `insert` string. This keeps exactly one set of braces regardless of whether the user typed `{{` or triggered via the explicit shortcut.
- **Prefix filter:** candidates whose `label` (namespaced, case-insensitive) contains the prefix, ranked so `startsWith` beats `includes`, then by `boost`. Empty prefix → the full list. `@codemirror/autocomplete`'s built-in fuzzy `filter` is disabled here (we own matching against the namespaced label) by returning `filter:false` and pre-filtering, so `env` matches `env.host` and `$ra` matches `$random.int`.
- Returns `null` (no popup) when there is no open `{{` — so the source is silent inside normal JSON/GraphQL text and never fights `cm6-graphql`.
- Each returned `Completion` uses `type` = `kind` (drives the colored left-glyph via `--lok-*`, see §4), `detail`, and `apply` = the `insert` string or a CM snippet for arg-taking dynamics.
- Config: this completion source is registered with `activateOnTyping: true` and an explicit keymap entry (`Ctrl-Space` / `Cmd-Space` → `startCompletion`) so users can force it open even without typing `{{` (it then inserts full `{{…}}`).

**Why one source, injected with a getter (`() => VarCandidate[]`):** CodeMirror extensions are created once per editor mount, but the active environment changes at runtime. The getter closes over `useEnvStore.getState().mergedActiveVars()` (+ optional run-vars) so every keystroke re-reads current candidates without re-instantiating the editor. No `useMemo` invalidation churn, no stale env.

### 1.3 Packaging as a CM extension bundle

**File:** `src/lib/completion/variableExtension.ts`

```
export function variableAutocomplete(opts: {
  getCandidates: () => VarCandidate[];
  closeBrackets?: boolean;
}): Extension;   // = autocompletion({ override:[source], activateOnTyping:true, icons:false, ... }) + tokenHighlight + keymap
```

Returns a ready `Extension[]`:
- `autocompletion({ override: [variableCompletionSource(getCandidates)], activateOnTyping: true, closeOnBlur: true, icons: false, aboveCursor: false })` — `icons:false` because we render our own kind-glyph via CSS on `.cm-completionLabel` prefix.
- `keymap.of([{ key: "Mod-Space", run: startCompletion }, ...completionKeymap])`.
- A tiny `MatchDecorator`-based ViewPlugin that paints existing `{{…}}` tokens in heat-tinted mono (the "pill" look the specs call for) — purely visual, `--lok-brand`/`--lok-brand-subtle`.

This one bundle is what every editor imports.

---

## 2. Mounting the engine in each field

### 2.1 CodeMirror fields (already CM — just add the extension)

| Field | File | Change |
|---|---|---|
| JSON request body | `workbench/BodyEditor.tsx` | Push `variableAutocomplete({ getCandidates })` into the `extensions` `useMemo` **after** `json()`/`linter` (the `{{…}}` source returns `null` outside a `{{`, so it never conflicts with JSON parsing/lint). |
| GraphQL query | `graphql/QueryEditor.tsx` | Push `variableAutocomplete({...})` **alongside** `graphql(schema)`. Both are completion sources; CM merges results from multiple sources, and ours returns `null` unless inside `{{`, so schema completion and `{{}}` completion **coexist without conflict** (see §3). |
| GraphQL variables (JSON) | `graphql/VariablesPanel.tsx` | Same as body: add the extension after `json()`. Optionally also feed **operation-variable names** parsed from the query (see §3.2) as extra candidates via a second lightweight source. |

`getCandidates` in all three closes over `useEnvStore` (and, in a workflow's RequestNode editor, over the run-var names). No prop-drilling: a small hook `useVariableCandidates(runVarNames?)` returns the memoized getter.

**File:** `src/hooks/useVariableCandidates.ts` — returns `() => buildVariableCandidates({ vars: useEnvStore.getState().mergedActiveVars(), runVarNames })`. (Reads via `getState()` inside the getter so it is always live; the hook only exists to give components a stable reference + subscribe for re-render when env identity changes.)

### 2.2 One-line fields (URL / param-value / header-value) — **decision: single-line CodeMirror**

**Decision: replace the plain `<input>` in `UrlInput` and the value cells of `KeyValueTable` with a single-line CodeMirror instance** (`basicSetup:false`, no gutters, no line numbers, `EditorState.transactionFilter` blocking newline insertion + Enter mapped to submit) carrying the **same `variableAutocomplete` extension**. Rejected alternative: a hand-rolled React dropdown listening to the input's caret.

**Why single-line CM (preferred) over a custom dropdown:**
1. **One engine, one behaviour everywhere.** The identical `{{…}}` popup, filtering, snippet insertion, keyboard model and styling appear in the URL, a header value, a body and a GraphQL query — no second matcher to keep in sync with `interp.rs`. A custom dropdown would re-implement caret/prefix/insert/ARIA and inevitably drift.
2. **Correct caret + token semantics for free.** CM knows the caret offset, replaces the exact `{{prefix` range, and supports snippet tab-stops for `$random.int(a,b)`. Doing this on a raw `<input>` means manual `selectionStart` math and manual re-insertion around the caret — fragile with IME/paste.
3. **A11y already solved.** CM's autocomplete emits the `listbox`/`option` roles, `aria-activedescendant`, and arrow/Enter/Esc handling. A custom dropdown would need all of that rebuilt and tested.
4. **Token pill highlight** (heat-tinted `{{…}}`) comes from the same `MatchDecorator`, so URL/header fields visually match the body — a spec goal ("pigułki z live-preview + autocomplete").
5. **Cost is contained.** A shared wrapper component means the migration is mechanical and the visual/height parity with the old `<input>` is enforced by CSS on `.cm-editor` (fixed height = one line, `--lok-fs-md` for URL / `--lok-fs-sm` for cells, `--lok-bg-input`).

**Trade-offs acknowledged:** CM is heavier than an `<input>` per cell, and `KeyValueTable` can render many rows. Mitigation: (a) the key/name column stays a plain `<input>` (header-name completion is a **static** short list better served by a datalist-style source — see §4/note); (b) value cells mount the single-line CM **lazily on focus** — an unfocused value cell renders a cheap read-only span with the token-pill highlight and swaps to the live CM editor on click/focus, so a 30-row table isn't 30 editors. This "display span → editor on focus" pattern is the standard grid-perf technique and keeps idle cost near the old input.

**File:** `src/components/common/SingleLineCodeInput.tsx` — the shared wrapper (props: `value`, `onChange`, `onEnter`, `ariaLabel`, `placeholder`, `fontSize`, `getCandidates`). One component, one file. Used by `UrlInput` and by `KeyValueTable`'s value cell (via a `KeyValueValueCell.tsx`).

**File:** `src/lib/completion/singleLine.ts` — the extension set that makes a CM editor behave like a one-line input: `EditorView.lineWrapping` off, a `transactionFilter` that rejects newline changes, `Prec.high` keymap mapping `Enter → onEnter()` and `Escape → blur` (Escape first closes an open completion, CM handles that before our handler).

### 2.3 Explicit "where mounted" summary

| Surface | Mount mechanism | Candidate set |
|---|---|---|
| URL bar | `SingleLineCodeInput` in `UrlInput.tsx` | env + secret-name + dynamic (+ run-var in workflow node) |
| Param value / Header value | `SingleLineCodeInput` in `KeyValueTable` value cell (lazy on focus) | same |
| Param name | plain `<input>` (unchanged) | — |
| Header name | plain `<input>` + **static header-name source** (§4) | common header names |
| Header value | `SingleLineCodeInput`; for `Content-Type` header, an **extra static value source** | env/secret/dynamic **+** MIME values when name==="content-type" |
| JSON body | extension in `BodyEditor.tsx` | env + secret-name + dynamic (+ run-var) |
| GraphQL query | extension in `QueryEditor.tsx`, next to `cm6-graphql` | env/secret/dynamic (+ run-var) **plus** schema (separate source) |
| GraphQL variables | extension in `VariablesPanel.tsx` | env/secret/dynamic **plus** operation `$var` names (§3.2) |

---

## 3. GraphQL

### 3.1 Schema autocomplete — confirm it is wired (it is)

Verified: `QueryEditor.tsx` already does `graphql(schema ?? undefined)` where `schema: GraphQLSchema | null` flows from `GraphqlExplorer` → `useGraphqlSchema(draft)` → introspection (`src/lib/graphqlIntrospection.ts`), with an SDL-paste fallback and a "Refresh schema" affordance. **So field/type/argument autocomplete already works whenever a schema is loaded.** No fix required for the schema path.

Only defensive hardening to note (not a rewrite): the `graphql()` extension is rebuilt via `useMemo([schema])`, so a schema refresh correctly re-arms completion. Keep that dependency array; do **not** collapse it.

### 3.2 Add `{{…}}` completion **beside** schema completion (no conflict)

Add `variableAutocomplete({...})` to `QueryEditor`'s extensions. CodeMirror runs **all** registered completion sources and unions their results. Our source returns `null` unless the caret is inside an open `{{`, and `cm6-graphql`'s source is inactive inside a `{{…}}` string region — so:
- Typing a field name → only schema suggestions.
- Typing `{{` inside a string argument (e.g. `user(id: "{{env.userId}}")`) → only our token suggestions.

They never render together for the same prefix, so there is no ranking collision. Because `{{…}}` is opaque string content to the GraphQL parser (confirmed by the `QueryEditor` doc-comment), lint is unaffected.

**VariablesPanel extra source (optional, low-cost):** parse the operation's declared variables from the current query text (`$var` in the operation signature, via `graphql`'s `parse` or a cheap regex `/\$(\w+)\s*:/g`) and offer them as JSON **keys** when the caret is at an object-key position in the variables JSON. This is a **separate** completion source from the `{{…}}` one (different trigger: object-key position vs. inside `{{`). It suggests `"varName":` to fill the variables object from the query. Kept optional/behind the same extension bundle with a `graphqlVarNames?: () => string[]` option.

---

## 4. Headers — static name + value suggestions

Header **names** and `Content-Type` **values** are a small closed set, so they use **static** candidate sources (no env/secret/dynamic — those still work in the *value* field via `{{…}}`).

**File:** `src/lib/completion/headerCatalog.ts` (pure data + two completion sources)

- `COMMON_HEADER_NAMES` — `Content-Type, Authorization, Accept, Accept-Encoding, Accept-Language, User-Agent, X-Request-Id, X-Api-Key, Cache-Control, Cookie, Origin, Referer, If-None-Match, If-Modified-Since, Content-Length` (canonical casing).
- `CONTENT_TYPE_VALUES` — `application/json, application/x-www-form-urlencoded, multipart/form-data, text/plain, application/xml, text/html, application/octet-stream, application/graphql-response+json`.
- `headerNameCompletionSource()` — a `CompletionSource` matching the whole (single-token) header-name cell against `COMMON_HEADER_NAMES`, case-insensitive, `startsWith`-boosted. Mounted on the **header-name** field. Because the name field stays a plain `<input>`, this source is delivered via a **minimal single-token CM** *or* a native `<datalist>`; **decision: `<datalist>`** for the name column (it is a closed static list, needs no `{{}}` engine, no caret math, and gets native keyboard/a11y for free — the lightest possible option and it keeps the table cheap). The value column keeps the `SingleLineCodeInput` (it needs `{{…}}`).
- `contentTypeValueCompletionSource()` — for the header **value** field, active **only** when the row's name (case-insensitive) is `content-type`; it adds `CONTENT_TYPE_VALUES` to that cell's `variableAutocomplete` as an extra static source (still alongside `{{…}}`). For all other header values, only `{{…}}` completion is active.

**Net:** header-name = native `<datalist>` of common names; `Content-Type` value = MIME list + `{{…}}`; every other header value = `{{…}}` only.

---

## 5. UX / a11y — the completion popup on tokens v2

**Styling (CSS on CodeMirror's tooltip, no new component):** target `.cm-tooltip.cm-tooltip-autocomplete` and `.cm-completionLabel/.cm-completionDetail` in `src/styles/` (a new `completion.css` imported by `base.css`), mapped **only** to semantic tokens:

- Popup surface: `--lok-bg-overlay`, `--lok-radius-md`, `--lok-shadow-md`, `1px --lok-border-default`. `z-index: var(--lok-z-dropdown)`.
- Rows: `--lok-fs-sm`, `font-family: var(--lok-font-mono)` (all candidates are code). Selected row: `--lok-bg-selected` (heat-tinted) + `--lok-text-primary`; hover: `--lok-bg-hover`.
- Detail text: `--lok-text-tertiary`, right-aligned, `--lok-fs-xs`.
- **Kind glyph** (left, one mono char, colored — replaces CM's default icons which we disabled): `env` → `--lok-status-info` `⚙`; `secret` → `--lok-status-warn` `∗` (masked look, never a value); `dynamic` → `--lok-brand` (`--lok-heat-500`) `ƒ`; `runvar` → `--lok-status-success` `→`. Colors double up with the glyph shape so it is **never color-only** (MASTER §6).
- Do not blur the popup (perf rule: blur only on palette/HUD).

**Keyboard (CM built-ins we keep):** `↑/↓` move selection, `Enter`/`Tab` accept, `Esc` closes the popup (and only then, on a single-line field, a second `Esc` blurs). `Mod-Space` force-opens. Focus stays in the editor throughout (popup is non-focusable, `aria-activedescendant` points at the active option).

**ARIA:** CM's autocomplete renders `role="listbox"` on the tooltip and `role="option"` per row with `aria-selected`, and sets `aria-activedescendant`/`aria-controls`/`aria-autocomplete="list"` on the editor's contenteditable. We **must not** strip these when theming. EN labels: the trigger inputs get `aria-label` from i18n (`autocomplete.*` keys); the popup content is the code tokens themselves (locale-independent).

**Reduced motion:** the popup's open/close uses a `--lok-dur-fast` opacity fade; under `prefers-reduced-motion: reduce` (hard-gated in `base.css`) it appears/disappears instantly — no transform.

**Positioning:** `aboveCursor:false` by default so the list drops **below** the caret and does not occlude what was typed; CM auto-flips above near the viewport bottom. On the URL bar (top toolbar) the list always drops down into the editor area.

**i18n (EN default) — new keys under `autocomplete` in `en.ts` (and mirrored in `pl.ts`):** `autocomplete.secretDetail` = "secret"; `autocomplete.dynamic.uuid` … one detail string per dynamic function; `autocomplete.headerNameAria`; `autocomplete.urlAria` (reuse existing `workbench.urlAria`); `autocomplete.valueAria`. All candidate **labels** are code and are NOT translated.

---

## 6. Test plan (Vitest + RTL)

All tests hit the **pure** builder and the **completion source** directly (no live editor needed for the logic); a few RTL smoke tests mount the wrapper. Files under `src/lib/completion/*.test.ts` and co-located component tests.

### 6.1 `variableCandidates.test.ts` (pure builder)
1. **Env vars appear** — given `MergedVar[]` with two public vars, builder yields `{{env.host}}`/`{{env.token}}` candidates with `kind:"env"` and `detail` = the public value.
2. **Secret names appear as names only** — given a secret-only `MergedVar` (`isSecret:true, value:""`), builder yields `{{secret.API_KEY}}`, `kind:"secret"`, and **`detail` never equals the value**; assert `detail === t("autocomplete.secretDetail")` and that no candidate's `insert`/`detail` contains the secret's would-be value even if a malicious `value` is injected into the input row (regression guard).
3. **Dynamic functions present & match `interp.rs`** — the `DYNAMIC_FUNCTIONS` inserts are exactly `{{$uuid}}, {{$timestamp}}, {{$timestamp_ms}}, {{$datetime.iso}}, {{$random.int(a,b)}}, {{$random.hex(n)}}, {{$base64(text)}}` (snapshot). Guards against drift from the Rust grammar.
4. **Run-vars gated** — omitted when `runVarNames` absent/empty; present as `{{var.token}}` when provided.
5. **De-dup + order** — env before secret before dynamic; duplicate `insert` collapsed.

### 6.2 `variableCompletion.test.ts` (completion source, using CM `EditorState` + `CompletionContext`)
6. **Triggers only after `{{`** — context with text `foo ` → source returns `null`; text `foo {{` → returns the full option list.
7. **Prefix filter** — `{{en` → only `env.*` options; `{{$ra` → only `$random.*`; `{{secret.A` → only secrets whose name startsWith `A`. Empty prefix returns all.
8. **`from` replaces the partial token, not the braces** — accepting `{{env.h|` inserts a single `{{env.host}}` (no doubled braces); assert resulting doc.
9. **Secret completion carries no value** — the returned `Completion.detail` for a secret is the literal secret-label string, never the store value (asserted again at the source layer).
10. **Snippet insertion for arg dynamics** — accepting `$random.int` yields `{{$random.int(0,9)}}` with the caret/selection on the first tab-stop.

### 6.3 GraphQL coexistence
11. **`{{}}` and schema coexist** — in a `QueryEditor` state with a stub `GraphQLSchema`, a completion context at a field position returns schema fields and **not** token options; a context inside `"{{"` returns token options and **not** schema fields. Proves the two sources don't collide.
12. **Operation `$var` keys** (if implemented) — variables-panel source suggests `"userId":` given `query($userId: ID!)`.

### 6.4 Headers
13. **Header-name suggestions** — `headerNameCompletionSource` (or the `<datalist>` options list) contains `Content-Type`, `Authorization`, `X-Request-Id`; case-insensitive `startsWith` match on `auth` → `Authorization`.
14. **Content-Type value list** — value source active only when name is `content-type`; returns `application/json` etc.; for a non-content-type header the static value source is absent (only `{{…}}`).

### 6.5 RTL smoke (wrapper mount)
15. **URL field is now a single-line CM that submits on Enter** — `SingleLineCodeInput` renders, typing does not insert newlines, Enter calls `onEnter`, Esc closes an open popup before blurring.
16. **KeyValue value cell swaps display→editor on focus** — idle cell renders a highlighted span; focusing mounts the CM editor (lazy) with the completion extension.

---

## 7. File manifest (for the executing agent)

**New (pure / shared):**
- `src/lib/completion/variableCandidates.ts` — builder + `DYNAMIC_FUNCTIONS` table (mirrors `interp.rs`).
- `src/lib/completion/variableCompletion.ts` — `variableCompletionSource`.
- `src/lib/completion/variableExtension.ts` — `variableAutocomplete()` bundle (+ token-pill `MatchDecorator`).
- `src/lib/completion/singleLine.ts` — one-line CM behaviour extensions.
- `src/lib/completion/headerCatalog.ts` — header names + Content-Type values + sources.
- `src/hooks/useVariableCandidates.ts` — live getter over `useEnvStore`.
- `src/components/common/SingleLineCodeInput.tsx` — shared one-line CM input.
- `src/components/workbench/KeyValueValueCell.tsx` — lazy display-span → editor value cell.
- `src/styles/completion.css` — popup + token-pill theming (imported by `base.css`).
- tests as in §6.

**Modified (add extension / swap input):**
- `workbench/UrlInput.tsx`, `workbench/KeyValueTable.tsx`, `workbench/BodyEditor.tsx`,
  `graphql/QueryEditor.tsx`, `graphql/VariablesPanel.tsx`,
  `i18n/en.ts` + `i18n/pl.ts` (`autocomplete.*` keys), `styles/base.css` (import).

**Unchanged (verified working):** `graphql/GraphqlExplorer.tsx` + `useGraphqlSchema` (schema autocomplete already wired); `src-tauri/src/interp.rs` (grammar is the source of truth; FE only mirrors it).

---

## 8. Key decisions (summary)

1. **Single-line CodeMirror, not a custom dropdown**, for URL / param-value / header-value — one engine, identical UX/a11y/token-pill everywhere, correct caret & snippet semantics, and it stays in lock-step with `interp.rs`. Perf contained via lazy display-span→editor cells and keeping the closed-list header **name** on a native `<datalist>`.
2. **Candidate source is one pure builder** fed by `useEnvStore.mergedActiveVars()` (public vars by value, secret **names** only), a static `DYNAMIC_FUNCTIONS` table mirroring `interp.rs`, and optional `{{var.NAME}}` run-vars — injected into CM via a live getter so env switches need no editor remount.
3. **GraphQL:** schema autocomplete is **already wired** (`cm6-graphql` + introspected schema) — no fix needed; we add a **second, non-conflicting** `{{…}}` completion source in the same editor (silent unless inside `{{`), plus optional operation-`$var` key suggestions in the variables JSON.
4. **Secrets are never valued** — names surface as `{{secret.NAME}}`; the builder and the completion payload carry no secret value, enforced by a regression test.
