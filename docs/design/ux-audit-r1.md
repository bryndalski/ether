# Ether — UX/UI Audit R1 (live app)

**Auditor:** ux-designer (team `ether-ux-polish`)
**Date:** 2026-07-13
**Target:** live dev build @ `http://localhost:1420`, viewport **1440×900**, EN default, Design System v2
**Method:** Playwright MCP navigation + screenshots + DOM/computed-style probes; cross-checked against `design-system/MASTER.md` + `src/styles/tokens.css` + `ui-ux-pro-max`.
**Scope note:** Tauri IPC is a no-op in the browser, so every data path returns its empty/offline state. This audit judges **layout, theme, typography, hierarchy, interaction affordances, contrast, and finish** — not live data. No production code changed (docs + screenshots only).

Benchmark bar: **Linear / Warp / Raycast**. Verdict up front: the bones are strong (token system, dark OLED floor, mono-where-it-counts, real focus rings, a genuinely nice Send wow-moment) — but the app currently **over-spends its one brand accent** (up to 4 heat blooms on one screen), leaks **wrong semantic color** (green "connected" when nothing is connected), leaks **Polish strings in the English default**, and several **empty/overlay surfaces read as unfinished** (muddy glow, weak scrim, big voids). Fixing the P0/P1 list moves it from "nice prototype" to "premium instrument."

---

## Screens reviewed

| # | Screen / state | Shot |
|---|---|---|
| 1 | Shell — first-run empty (sidebar hero + editor hero) | `ux-shots/01-shell-empty-dark.png` |
| 2 | Request Workbench — request created, empty fields | `ux-shots/02-workbench-filled-dark.png` |
| 3 | Workbench — URL typed, **Send active** (heat) + focus ring | `ux-shots/03-workbench-url-active-send.png` |
| 4 | ⌘K Command palette | `ux-shots/04-command-palette-dark.png` |
| 5 | Environment manager — empty | `ux-shots/05-env-manager-empty-dark.png` |
| 6 | Environment manager — after "New environment" (no-op offline) | `ux-shots/06-env-manager-editor-dark.png` |
| 7 | GraphQL explorer — 3 panes, all empty | `ux-shots/07-graphql-explorer-dark.png` |
| 8 | Workbench — **light theme** | `ux-shots/08-workbench-light.png` |

---

## What's strong (keep it)

- **Token architecture** — semantic `--lok-*` tokens, dark-first with a light override map. Clean, themeable, disciplined. Don't regress this.
- **Send wow-moment** (shot 3) — heat gradient fill + glow + heat focus ring on the URL is genuinely premium and on-brand. This is the target quality bar for the *rest* of the app.
- **Mono discipline** — URL, `HTTP/2`, `— ms`, version, kbd glyphs are all monospaced. Correct and distinctive.
- **Command palette IA** (shot 4) — grouped Request / Environments / Tools / View with shortcut glyphs and a real left-accent selection band is Raycast-tier structure.
- **Tab underline** — heat hairline under the active workbench tab is a tasteful, restrained use of the brand.
- **Real focus-visible rings** and a `prefers-reduced-motion` hard gate exist in `base.css` — the a11y foundation is present.

---

## Priority fixes

### P0 — blocks the premium bar / correctness bugs

**P0-1 · Heat glow is muddy AND massively over-used (up to 4× per screen).**
The GraphQL screen (shot 7) renders **four** heat blooms at once — *Fields*, *Docs Explorer*, the *Response* dock, plus the query editor gutter — and the first-run shell (shot 1) renders two. This directly violates the brand's own law ("Color is information, never decoration… heat used *sparingly*: Send, active/progress, waterfall, live env"). At `filter: blur(8px)` / `opacity:.55` / `scale(2.4)` the `heat-500→heat-800` radial reads as a **reddish-brown smudge**, not a glow — and on the **light** theme (shot 8) it reads as a coffee-stain watermark.
- **Fix (CSS):** `src/styles/base.css` `.lok-heat-glow` → `filter: blur(44px)`, `opacity: .30` (dark) / `.16` (light via `[data-theme="light"] .lok-heat-glow`), and drop the inline `scale(2.4)` in `EmptyState.tsx` to `~1.4`.
- **Fix (composition):** `EmptyState.tsx` — add a `glow?: boolean` (default **false**). Only ONE empty region per screen may set `glow`. Concretely: the **primary** editor/response empty state keeps the glow; **secondary** panes (GraphQL *Fields*, *Docs Explorer*, sidebar) render a quiet, glow-less empty state.
- **Files:** `src/styles/base.css`, `src/components/common/EmptyState.tsx`, GraphQL pane consumers (`src/components/devtools/*` / graphql explorer), `src/components/sidebar/Sidebar.tsx`.

**P0-2 · "No environment" is colored GREEN (semantic lie).**
Env pill (topbar) and the status-strip health dot are **green** when there is no environment and nothing is connected (shots 1–8). Per the spec, green = `local` = "safe, connected." Showing it for *no env* tells the user they're connected to a safe local env when they're not. Root cause: `HealthDot` defaults to `health="up"` (→ `--lok-status-success`), and `--lok-env-accent` falls back to `--lok-env-local` (green) because there is **no `[data-env="none"]` mapping**.
- **Fix:** `src/components/common/HealthDot.tsx` — default `health` to `"checking"` (amber) or add a `"none"` → `--lok-status-neutral`; the status bar should pass `none` when `activeEnvironment` is null. Add `[data-env="none"] { --lok-env-accent: var(--lok-status-neutral); }` to `base.css` and set `data-env="none"` on the shell/pill when no env. Env pill label stays "No environment" but goes **neutral gray**, not green.
- **Files:** `HealthDot.tsx`, `StatusBar.tsx`, topbar env-pill component, `base.css`.

**P0-3 · Two competing hero empty-states on first run.**
Shot 1: the sidebar shows a full hero (`🌀` + glow + "Send your first request" + "New request ⌘N") *and* the editor shows its own hero (`~` + glow + "Paste a curl…" + "New request ⌘N"). Two glowing heroes and two identical primary CTAs fight for the eye; nothing tells the user which to click.
- **Fix:** Sidebar gets a **compact** empty state (small icon, one line, a quiet ghost "New request" — no giant glow). The **editor** keeps the single glowing hero as the one true first-run CTA. Add a `compact` variant to `EmptyState.tsx`.
- **Files:** `src/components/sidebar/Sidebar.tsx`, `src/components/common/EmptyState.tsx`.

---

### P1 — visible quality / a11y / i18n

**P1-4 · Polish strings leak in the English default (i18n + a11y).**
Accessibility tree exposes hardcoded Polish: `tree "Kolekcje"`, `button "Akcje dla New request"`, `combobox "Metoda HTTP"`, `textbox "URL requestu"`, `tablist "Typ requestu"`, `tabpanel "Parametry"`, `"Zmienne operacji"`, `"Edytor zapytania GraphQL"`, `combobox "Typ operacji GraphQL"`. Screen-reader users on EN get Polish; it's also just unfinished.
- **Fix:** route every `aria-label`/tree label through `useT()`; add the missing EN keys. Grep for the literals above in `src/components/{sidebar,workbench}/**`.
- **Files:** `src/i18n/en.json`, sidebar + workbench + graphql components.

**P1-5 · Modal & palette scrim is too weak — overlays don't float.**
In both the env modal (shot 5) and the ⌘K palette (shot 4) the app behind stays fully bright/legible; the Send button, sidebar rows and status strip read at full strength through the "backdrop." Spec scrim is `rgba(6,6,10,.66)` (dark) — it is not landing. The overlay feels stuck *in* the page, not above it.
- **Fix:** ensure a full-viewport backdrop element actually paints `background: var(--lok-scrim)` (and the palette panel uses `.lok-glass` blur). Verify z-index: scrim above content, panel above scrim.
- **Files:** `src/components/env/env.css` + env manager modal, command-palette component/CSS.

**P1-6 · Env-manager empty state = large void, CTA hidden in a corner.**
Shot 5: an almost full-height modal contains only "No environments." (top-left, tiny) and "Pick or create…" with the only action — **New environment** — tucked into the bottom-left corner. Reads as broken/unfinished.
- **Fix:** when the list is empty, center a proper empty state in the editor pane (icon + one line + the **New environment** button as the hero). Consider sizing the modal to content instead of near-full-height when empty.
- **Files:** `src/components/env/EnvironmentManager.tsx`, `EnvList.tsx`.

**P1-7 · Empty-state headline gradient fails contrast on LIGHT theme.**
`.lok-heat-text` paints `heat-300 (#ff93b4) → heat-900`. On white the light stop `#ff93b4` on `#ffffff` ≈ **2.1:1** — the top half of "Press Send and watch the waterfall" (shot 8) is barely legible (large text needs ≥3:1).
- **Fix:** add a light-theme override so the headline is solid `--lok-text-primary`, or shift the gradient to `heat-600 → heat-900` under `[data-theme="light"] .lok-heat-text`.
- **Files:** `src/styles/base.css` (light override), `EmptyState.tsx`.

**P1-8 · Status strip: text too small and (light) sub-AA.**
Status bar renders at `--lok-fs-2xs` → **10.45px** computed, in `--lok-text-tertiary`. Light: `#6a6a7d` on `#ececef` ≈ **4.48:1** at ~10px → **fails AA** for small text (also below the spec's own 11px floor for micro-labels). `— ms`, `v0.1.0` are hard to read (shot 8).
- **Fix:** bump the strip to `--lok-fs-xs` (12px) and/or use `--lok-text-secondary`; if kept at tertiary, deepen the light tertiary token.
- **Files:** `src/components/statusbar/StatusBar.tsx`, optionally `tokens.css` light `--lok-text-tertiary`.

**P1-9 · Cryptic, repeated `~` empty-state glyph.**
The tilde is reused as the icon for *editor*, *response*, *GraphQL Fields*, *Docs Explorer* (shots 2,3,7). It carries no meaning and screams "placeholder."
- **Fix:** per-context **Lucide** icons (stroke 1.5, per §4): e.g. `terminal`/`send` for the request hero, `activity`/`waveform` for the response/waterfall, `braces` for GraphQL fields, `book-open` for Docs Explorer. Never reuse one glyph for four meanings.
- **Files:** `EmptyState` call sites.

**P1-10 · Toolbar action affordance is inconsistent.**
Save + Copy-as-cURL are **icon-only with no visible label or tooltip**, while Benchmark and Send are labeled (shots 2,3). New users can't tell what the two ghost icons do.
- **Fix:** add tooltips (title/aria are present but no hover tooltip surface) and consider a small text label on hover; keep Send/Benchmark as-is.
- **Files:** `src/components/workbench/RequestBar.tsx` (+ `SendButton`, `CurlTab` copy).

---

### P2 — polish / delight

- **P2-11 · Palette input has a permanent loud magenta border** (shot 4) — the heat ring should appear on `:focus-visible` only; default state should be a subtle `--lok-border-default`. *(command-palette CSS)*
- **P2-12 · Selected sidebar row** uses a full-width heat tint (`--lok-bg-selected` .12) that reads slightly alarm-ish; add a 2px **left method-color accent bar** and lower the tint for a calmer, more "instrument" selection. *(sidebar.css / RequestRow.tsx)*
- **P2-13 · Kbd glyphs low-contrast** — `⌘N`/`⌘↵` inside the heat CTA (white @ opacity .85) and the palette's dim shortcut column; give them a subtle chip background for legibility. *(EmptyState.tsx, SendButton.tsx, palette)*
- **P2-14 · Long URL hides its start** — the input scrolls to the tail (`…ub.com/users/octocat`, shot 3); on blur, reset scroll to show the protocol/host. *(UrlInput.tsx)*
- **P2-15 · GraphQL query editor looks dead** — only a `1` gutter, no placeholder; add a faint `# Write a query…` hint. *(graphql query editor)*
- **P2-16 · Wide-viewport dead space** — at 1440 the response/right region is a large void; consider a max content width or a subtle centered hint so it doesn't feel empty. *(layout)*
- **P2-17 · Elevation seams** — sidebar↔editor and editor↔response separate mostly by a hairline; lean harder on the luminance step (`ink-50`/`ink-100`) the design system already defines so separation reads without borders (per "elevation by light").

---

## Contrasts to fix (measured)

| Where | FG | BG | Size | Ratio | Verdict |
|---|---|---|---|---|---|
| Status strip text (light) | `#6a6a7d` tertiary | `#ececef` sidebar | ~10.45px | **≈4.48:1** | **Fails AA** (small text needs 4.5; also under 11px floor) |
| Empty-state headline top stop (light) | `#ff93b4` heat-300 | `#ffffff` | large (24px) | **≈2.1:1** | **Fails** (large text needs ≥3:1) |
| "No environment" pill / health dot | green `#3ddc97` | — | — | n/a | **Semantic fail** — green = connected/safe; must be neutral when no env (P0-2) |
| Palette shortcut glyphs (`⌘N`…) | tertiary | overlay | 11px | ~ borderline | Verify ≥4.5:1; deepen if not (P2-13) |
| Kbd chip on heat CTA | white @ .85 | heat gradient | 11px | low | Give chip bg (P2-13) |

> Dark-theme primary/secondary body text checks out (spec claims AAA and the token ramp supports it). The failures cluster on **light-theme micro-text** and **gradient-on-white headlines**.

---

## Console note (not UX, flag to frontend)

`GraphQL` mount throws `TypeError: Cannot read properties of undefined (reading 'invoke')` (`src/lib/ipc.ts:67` `gqlSchemaGet`) because Tauri IPC is absent in the browser. The empty state still renders, so it's cosmetic here — but `ipc.ts` should guard `window.__TAURI__` and fail soft rather than throw. Out of my scope; noted for `frontend`.

---

## Handoff

Recommended build order for `frontend`: **P0-1 → P0-2 → P0-3** (biggest premium-lift, all token/CSS/composition, low risk), then **P1-4/5/6/7/8**, then P2 polish. All fixes are CSS/token/composition/i18n — no architecture change. Re-render + re-screenshot the same 8 states after implementation for the R2 review gate.
