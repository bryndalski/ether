# Ether — UX/UI Overhaul Spec

**Author:** principal product designer + UX auditor
**Date:** 2026-07-13
**Method:** live app (clean `main` @ `d0c1789`) driven with Playwright MCP at 1440×900 and 1100×700, dark + light, plus a full read of the component source. Screenshots in `./shots/`.
**Benchmark (explicit user directive):** *"ma być jak w Postmanie i Insomni"* — Postman & Insomnia are the ergonomic north star. Every major view below is measured against how those two solve the same problem, then adapted to Ether while keeping the **heat brand**.

> **Context / relationship to prior work.** Two earlier passes exist: `ux-audit-r1.md` and `ux-review-r2.md` (a PR `#34 feat/ux-polish` that fixed R1's P0/P1 — glow overuse, the green "No environment" lie, double-hero, PL aria-labels, light heat-text contrast, status-strip AA). **This spec audits `main`, which does NOT yet contain those fixes**, and — more importantly — responds to a *new, broader* user directive: not "polish the premium dark look" but "**make the ergonomics feel like Postman/Insomnia**." That is a structural change (density, proportion, information architecture, surface luminance), not a color-polish pass. Where R1/R2 already have a fix queued, this spec says so and does not re-litigate it; the bulk here is net-new systemic direction.

> **Ten separate bugs are being fixed by other agents** (URL bar, params sync, panel resize, HTML preview, GQL mutations+autocomplete, env editor, filters, workflow node config). This spec deliberately does **not** re-audit those. It goes wider: the *system* and the *direction*.

---

## 1. Diagnosis — why the whole thing feels "do poprawy"

The design **tokens are excellent** (a real heat brand, a hand-tuned OLED ink ramp, AA-considered status hues, a 4px grid, motion recipes). The problem is almost entirely in **application**, and it clusters into six systemic failures:

1. **Surface luminance is too low across the board.** The dark theme floors on `#060709`/`#0b0d12`. In a *content-light* app (mostly empty panels, one request) that reads as an oppressive black void, not "cinematic." Postman/Insomnia dark themes floor much higher (~`#1e1e1e`–`#2a2a2a`) precisely because an API client is a *workbench*, not a media player — the eye needs mid-dark surfaces to separate panels without heavy borders. **This is the single biggest driver of "za ciemno."** (Tellingly, the same layout in *light* mode — shot 14 — instantly reads calmer and more professional.)

2. **The empty response dock permanently eats ~42% of the window** even when the user has a fully-configured request and hasn't sent yet (shots 02, 03, 15). Postman/Insomnia collapse the response pane to a thin idle strip until a response exists — the request editor owns the screen while you build. Ether inverts this: half the screen is a giant "Press Send" hero doing nothing.

3. **No shared control-sizing system → everything is small and inconsistent.** There is *no* `.lok-btn`/`.lok-input` base class; every control is sized ad-hoc (24–32px tall, 11–13px type). Chrome runs at `--lok-fs-2xs` (11px) and `-xs` (12px) far too often. Hit-targets and labels are below the comfortable desktop-tool baseline. **This is "przyciski za małe."**

4. **The heat brand is over-spent → nothing reads as "the one hot thing."** On a single screen the URL string glows magenta, the empty-state headline glows magenta, *and* Send glows magenta — three hot spots (GraphQL shows two heat headlines side-by-side, shot 05). The token file's own rule ("**one hot thing on screen**, everything else neutral ink") is violated. Result: the accent stops meaning "this is the action" and just adds noise.

5. **Layout shifts instead of overlays; fixed-pixel splits everywhere.** The URL CodeMirror can grow and **collide with the tabs below** (the screenshot the user flagged; visible partial-clip in shot 02). GraphQL (`280/1fr/260`), Workflows (`220/1fr/300`) and Env (`240/1fr`) are all hard-coded non-resizable grids. Nothing about the geometry is "yours to adjust" the way Postman's draggable everything is.

6. **First-run and discoverability are weak.** Two competing "New request" CTAs on the empty screen (sidebar ghost + center hero); a whole **DevTools drawer that has no trigger at all** (dead-wired); Import/Env reachable only by shortcut or a buried dropdown item; the `~` tilde glyph reused as the icon for *every* empty state so nothing is visually distinct. A newcomer doesn't get a clear "do this first."

**One-line synthesis:** the parts are premium but they're arranged like a dark showpiece, not a dense working instrument. The overhaul is: **lift the surfaces, spend the heat once, give the request editor the room and the response the restraint, and standardize control sizing — so it feels like Postman/Insomnia with Ether's heat.**

---

## 2. Design direction

### 2.0 The Postman/Insomnia ergonomic contract (what we're adopting)
| Principle | Postman / Insomnia | Ether target |
|---|---|---|
| Single-line request bar | `[Method ▾][ URL …………… ][Send]` one row, URL is the elastic flex child, always widest | Same. URL flex:1, min-width protected; secondary actions (Save/Copy/Benchmark) collapse into an overflow "⋯" before the URL ever shrinks |
| Request owns the screen | Response is a collapsed strip until you Send; then it splits | Idle response = 44px "Ready" strip, not a 42% hero |
| KV tables | Borderless grid, inline `key`/`value` cells, hover-only row actions, "add row" is a ghost last row | Adopt borderless grid; drop the per-cell boxed borders (shot 03) |
| Density | 13px UI, **32–36px rows**, tight but not cramped | Standardize on 34px rows, 13px base, 14px for primary inputs |
| Sidebar | ~280–300px, collapsible, method-colored request rows | Keep 280px default, make collapsible, keep method badge |
| Everything resizable | drag handles on every split | Add drag handles to GraphQL/Workflow/Env splits |

### 2.1 Surface scale — lift the dark floor (keep the heat)
The heat ramp, status hues, method hues, spacing, radius, typography, motion **stay**. Only the dark **surface** ink steps rise, so panels separate by luminance (Postman-style) instead of by the near-black void. Proposed remap of `--lok-bg-*` (dark theme) — values chosen so back→front still steps cleanly and the ambient heat bloom still reads:

| Semantic token | Current (main) | Proposed | Role |
|---|---|---|---|
| `--lok-bg-app` | `#060709` | `#131519` | window backdrop |
| `--lok-bg-sidebar` | `#0b0d12` | `#181b21` | collections rail |
| `--lok-bg-surface` | `#101319` | `#1e2129` | editor / response panels |
| `--lok-bg-raised` | `#161a22` | `#252932` | toolbars, tabs, cards |
| `--lok-bg-overlay` | `#1d222c` | `#2c313c` | dropdowns, popovers |
| `--lok-bg-code` | `#0b0d12` | `#16181e` | response / curl pane (stays deepest for code contrast) |

Keep an even deeper `--lok-bg-app` option behind a "Pure black (OLED)" preference for users who want it, but **default to the lifted scale**. Borders can then get *lighter* (`--lok-border-subtle` → `rgba(255,255,255,0.05)`) because luminance is doing the separation. Net effect: same brand, same OLED character, but a workbench you can read for 8 hours.

### 2.2 Typography scale — nudge the working sizes up
Keep the ramp names; shift what the chrome *uses*:
- **Base UI text: 13px** stays, but stop using 11px (`-2xs`) for anything a user reads repeatedly. Table cells, tab labels, status strip → **12px minimum**, and tab labels specifically to **13px**.
- **Primary inputs (URL, palette, search): 14px** (`--lok-fs-md` drops from 15→14 is optional; the point is URL/search read at 14, not 13).
- **Section eyebrows** (PARAM/VALUE/HEADER headers): keep 11px uppercase but raise contrast to `--lok-text-secondary`.
- Add one token: `--lok-fs-13: 0.8125rem` is already `-sm`; just enforce it as the floor for interactive labels.

### 2.3 Spacing & control sizing — introduce a real component scale
Create the missing base classes (this is the fix for "buttons too small"):

```
Button sizes (height / pad-x / font):
  --lok-ctl-sm: 28px / 10px / 12px   (dense table row actions, chips)
  --lok-ctl-md: 34px / 14px / 13px   (DEFAULT — all toolbar buttons, tabs, inputs)
  --lok-ctl-lg: 40px / 20px / 14px   (primary CTAs: Send, Run, empty-state action)

Input height: 34px (md) default, 40px for the URL bar & palette.
Table row height: 34px. Tab bar height: 38px (up from 34).
Toolbar height: 48px (up from 44) to comfortably seat 40px Send + 34px controls.
Min hit target: 28px (never below).
```
Send/Run become **40px (`lg`)** — they are *the* action and should read as such. Save/Copy/Benchmark become 34px `md` icon+label buttons (see 2.6) instead of 32px icon-only squares.

### 2.4 Elevation
With lifted surfaces, replace most hairline borders with a **1px luminance step + a soft `--lok-shadow-xs`** on raised elements (toolbars, cards, the response head). Keep borders only on inputs (focus affordance). This is how Postman/Insomnia get "panels" without a grid of visible lines.

### 2.5 The "one hot thing" rule — spend heat once per screen
Enforce a strict hierarchy of who may use heat:
1. **Send / Run** (the primary action) — full heat gradient. Always.
2. **Active/progress state** — the in-flight Send, the waterfall wait/download bars, an active env pill.
3. **Selected item accent** — a 2px heat left-border (already the palette pattern) — *this is a hairline, not a fill or a glow*.

Everything else goes **neutral ink**:
- **URL string → neutral mono** (`--lok-text-primary`), not magenta. Tokens `{{…}}` keep a subtle heat pill (that's meaningful). This alone removes the loudest offender.
- **Empty-state headlines → `--lok-text-primary` (solid), not heat gradient.** Reserve the gradient for the *hero* empty state only when there's exactly one on screen. GraphQL's two side-by-side heat headlines both go neutral.
- **The ambient top-right heat bloom stays** (it's the "atmosphere," under 6%).

---

## 3. Per-view redesign

Legend: **P1** = blocks the Postman-parity bar / correctness, **P2** = visible quality, **P3** = polish.

### 3.1 Request Workbench (shots 02, 03, 15) — the centerpiece
**Postman/Insomnia:** one-line request bar `[Method][URL……][Send]` where URL is the widest thing; a tab strip (Params/Headers/Body/Auth/…); the request editor **owns the screen**; the response is a collapsed strip until you Send, then it splits (bottom or right, draggable).

**Ether problems:** URL glows magenta and can overflow into the tabs (layout-shift, not overlay); toolbar crowds the URL out at narrow width (shot 15 — URL clipped to `https://api.examp…` while Benchmark/Send keep full width — priority inversion); response dock permanently claims 42% showing an empty hero.

**Target layout:**
```
┌───────────────────────────────────────────────────────────────┐
│ [REST|GraphQL]  [GET ▾]  [ https://api…/{{env.host}}/users  ] [⋯] [ Send ⌘↵ ] │  48px toolbar
├───────────────────────────────────────────────────────────────┤
│ Params ⁵   Headers   Body   Auth   Tests   Scripts   cURL      │  38px tabs
├───────────────────────────────────────────────────────────────┤
│  (active tab body — OWNS all remaining height until Send)      │
│                                                                │
├───────────────────────────────────────────────────────────────┤
│ ● Ready · GET · no response yet          [Send to see results] │  44px idle response STRIP
└───────────────────────────────────────────────────────────────┘
     ↑ on Send, this strip animates up into the 42% split dock
```
- **URL is the elastic flex child** with a protected `min-width: 320px`. Save / Copy-as-cURL / Benchmark collapse into a **`⋯` overflow menu** the moment the toolbar can't fit them at full URL width. Send never collapses.
- **URL renders neutral mono**, `{{token}}` pills keep heat. Long URLs scroll horizontally *inside* the field (already the behavior) — but the field must never grow the toolbar height or overlap the tabs (see systemic rule §5.1).
- **Idle response = a 44px strip** (`● Ready · <method> · no response yet` + a quiet "Send" hint), NOT the 42% hero. The hero moves *into* the strip's expanded state after Send. This reclaims ~35% of vertical for the actual work.
- **KV table (Params/Headers)** → borderless Postman-style grid (see §4.3): drop the boxed per-cell borders (shot 03), use a single bottom hairline per row, 34px rows, inline `key`/`value` inputs, checkbox + hover-only remove.

### 3.2 Response Dock (shot 04 error; structure from code)
**Postman/Insomnia:** status pill + time + size on one meta row; tabs Body/Headers/Cookies/Timeline; pretty/raw/preview switch; body fills the pane. Idle = collapsed.
**Ether:** good bones (status code pops, waterfall exists, rich conditional tabs JWT/Cert/Bench). Problems: idle hero too big (fixed in 3.1); tab labels literal + small.
- Keep the tab set; raise tab labels to 13px, add the copy button as a labeled `md` control on wider widths.
- **Waterfall** (`88px | track | 64px`, 12px-tall bars) is good — keep the two heat phases (TTFB/download) as the *only* heat in the response, reinforcing "one hot thing."
- Error banner styling (shot 04) is good — keep.

### 3.3 Sidebar / Collections (all shots)
**Postman/Insomnia:** ~280–300px, collapsible, search on top, method-colored request rows ~30–34px, folders with disclosure, right-click actions.
**Ether:** already close — 260px, search, method badge (`w-12`), tree rows ~28px, hover kebab. Adjustments:
- Default width **280px**; make it **collapsible** (a collapse toggle in the header; the workbench reclaims the space). Persist collapsed state.
- Row height to **34px**; method badge stays but drops to a tighter chip.
- **Empty state:** keep the compact single CTA (R2 already removed the double-hero — adopt that here on main); use a distinct icon (see §4.5), not the shared `~`.
- Show the **Workflows list** in the sidebar when in Workflows mode (currently the request tree persists into Workflows mode — confusing, shots 06/11).

### 3.4 GraphQL Explorer (shot 05)
**Postman/Insomnia (GraphiQL lineage):** left schema/docs, center query+variables (variables docked below), right docs; all splits draggable; a starter query in the editor.
**Ether:** correct 3-column concept (`280/1fr/260`) but: fixed non-resizable; **two heat empty-state headlines side-by-side** (violates one-hot-thing); blank editor with no starter query; whole lower area is the shared empty response void.
- **Neutralize both empty headlines** ("No schema yet", "Docs appear here") to `--lok-text-primary`.
- Add **draggable handles** between the three columns.
- **Seed the editor** with a commented starter (`# Write a query, ⌘↵ to run`) so first-run isn't a blank slab.
- Apply the same **idle-response-strip** treatment (3.1) so the explorer isn't sitting on a 40% void.

### 3.5 Workflows (shot 06) — the strongest view
**Postman (Flows) / Insomnia:** node canvas, left palette, right inspector.
**Ether:** genuinely good — palette chips have title+description, danger pill is honest, inspector is clear. Two fixes:
- **React-Flow default Controls render as a stark white strip** bottom-left (jarring on dark, shots 06/11) — style them to `--lok-bg-raised` + ink icons. **P1 visual bug.**
- **Run button is green-bordered (env accent), not heat.** Run is a primary action → give it the heat gradient `lg` treatment (consistent with Send). Keep the "Real requests — live endpoints" red pill for the danger signal.

### 3.6 Environments Manager (shots 09, 10)
**Postman/Insomnia:** environment list + a KV table of variables; secrets masked; "globals" separate.
**Ether:** 880×600 two-pane modal (`240/1fr`). Problems: **two "New environment" CTAs** (footer ghost + center hero); **hardcoded Polish `"Zmienne publiczne"` / `"Sekrety"`** section headers (i18n bypass); no split handle.
- **One primary CTA**: keep the footer "＋ New environment" (list-scoped, always visible); the empty-state center becomes a quiet single hero only when zero envs exist.
- **Fix the Polish leak** → `"Public variables"` / `"Secrets"` via i18n.
- Variables table adopts the borderless KV grid (§4.3). Secret rows show the Keychain badge + "Set secret" (the macOS-Keychain copy is good — keep).

### 3.7 History (shots 11, 13)
**Postman/Insomnia:** history list grouped by day, each row shows method+status+URL+time; click to restore; diff/compare in Postman.
**Ether:** right slide-over drawer (`min(560px,92vw)`), CompareBar (pick 2 → diff), DiffPanel with Body/Headers/Timing tabs — a *strong* feature. Problems: **hardcoded Polish scope toggle `"Wszystkie"` / `"Ten request"`** (shot 13 — sits next to the English "History" title, glaring i18n bug); rows are info-dense but the drawer competes with the workbench.
- **Fix the Polish leak** → `"All"` / `"This request"`.
- Keep the drawer; ensure it opens reliably from the status-bar button *and* ⌘Y (in-app both should work).

### 3.8 Import (shot 08)
**Postman/Insomnia:** a focused import dialog; paste/file/link tabs.
**Ether:** 720×560 modal, tabs Paste cURL / Import file / Scan history. Problems: modal is **over-tall for its content** (~40% empty lower half); tabs run together visually (only active underlined); heavy focus ring on the close X.
- **Size the modal to content** (auto-height up to a max), or fill the lower half with a live preview of the parsed request.
- Give the TabBar clear inactive affordance (spacing + hover), not just an underline on the active one.

### 3.9 Command Palette (shot 07) — the quality bar
Already the best view: clean grouping (REQUEST/ENVIRONMENTS/TOOLS/VIEW), heat-tint selected row + left border, right-aligned shortcuts. **Make the rest of the app look like this.** Only nits: the always-on magenta border around the input is heavy (R2 P2-11 — soften to a focus-only ring); palette sits a touch high (`top:18%`).

### 3.10 Top bar & Status bar (all shots)
- **Top bar (40px):** Wordmark + ModeTabs (Requests/Workflows) + EnvPill + ⌘K hint. Solid. Keep. (Env pill neutral-gray when no env is R2's fix — adopt on main.)
- **Status bar (26px):** env · `HTTP/2` · `— ms` · History · version. The `HTTP/2` and `— ms` are static placeholders — wire them to the real last response or hide until there is one (a permanent "— ms" reads as broken).

### 3.11 DevTools drawer (structure from code)
**Dead-wired: no trigger exists anywhere** (`openDevTools`/`toggleDevTools` are never called). Either (a) add a trigger — a palette entry "Open Dev-Tools" + a status-bar/toolbar affordance — or (b) remove the drawer and rely on the response-dock JWT/Cert/Bench tabs (which *are* reachable). **Decide and wire one path.** Also fix hardcoded `"Dev-Tools"`/`"JWT decoder"` strings → i18n.

---

## 4. System components to unify

Today there is **no shared control layer** — every button/input/table is bespoke. Define these once (a `components/common/` primitives set + CSS classes) and refactor call-sites onto them.

### 4.1 Button (`.lok-btn`, variants × sizes)
- **Sizes:** `sm 28px` / `md 34px` (default) / `lg 40px` (primary).
- **Variants:** `primary` (heat gradient — Send/Run/one-per-screen only), `neutral` (raised bg + border), `ghost` (transparent, hover bg), `danger` (status-danger).
- All get: `:hover` bg-lift, `:active` scale 0.97 (motion token), `:focus-visible` 3px focus ring, `:disabled` dim. Icon-only buttons **must** carry `aria-label` + a tooltip (R2 P1-10).

### 4.2 Input (`.lok-input`)
- **34px** default (`md`), **40px** for URL/palette/search; 13px (14px for the big ones); radius-sm; border-default → border-focus + focus ring; consistent placeholder color `--lok-text-tertiary`.
- **CodeMirror single-line inputs must inherit the same background per theme** — fixes the **dark URL box floating in light theme** (shot 14, a real bug).

### 4.3 Key-Value table (`.lok-kv`)
The Postman/Insomnia workhorse. One definition used by Params, Headers, Multipart, Env variables:
- Grid `28px | 1fr | 1fr | 28px` (enable / key / value / remove).
- **Borderless:** no per-cell box; a single `--lok-border-subtle` bottom hairline per row; 34px rows; inline mono inputs; header eyebrow row (KEY/VALUE) at 11px uppercase.
- Hover reveals the remove `×`; the trailing empty "add row" is always present (ghost).
- `{{token}}` pills render heat inside values (meaningful accent).

### 4.4 Tabs (`.lok-tabs`)
- 38px bar; 13px labels; active = `--lok-text-primary` + 2px heat underline (`::after`); inactive = `--lok-text-tertiary` with a clear hover. Optional count chip (11px pill). Used by request tabs, response tabs, import, GraphQL vars, diff.

### 4.5 Empty states (`<EmptyState>`)
- Two variants exist (full/compact) — keep, but: **one distinct icon per context** (replace the reused `~` tilde with per-context Lucide glyphs — R1/R2 P1-9: request `⚡`/send, schema graph, env globe, history clock, docs book). Headline **solid `--lok-text-primary`** except the single hero on a screen. One CTA per empty state (kill duplicate CTAs — sidebar vs center, env footer vs center).

### 4.6 Dialogs/modals
- Consistent header (title 18px + close `md` icon button, no heavy focus ring), scrim `--lok-scrim`, radius-lg, content-driven height with a sane max. Import/Env/SetSecret/RunConfirm all conform.

---

## 5. Systemic rules (apply everywhere)

**5.1 Overlay, never layout-shift.** No control may grow and push/overlap its neighbors. Specifically the **URL field must never expand the toolbar or overlap the tab strip** (the user's flagged screenshot). Long content scrolls *within* a fixed-height field; autocomplete/expansion renders as a **floating overlay** (position:absolute, `z-dropdown`) above the layout, not by reflowing it. This applies to URL autocomplete, env quick-look, method select, any popover.

**5.2 One hot thing per screen** (§2.5) — enforced in review.

**5.3 Response is subordinate until it exists** — idle = strip, not hero (§3.1).

**5.4 No hardcoded copy; no i18n bypass.** Kill `"Zmienne publiczne"`, `"Sekrety"`, `"Wszystkie"`, `"Ten request"`, `"Dev-Tools"`, `"JWT decoder"`, and the literal tab labels — route all through i18n (pl/en).

**5.5 No dead-wired features** — every panel (esp. DevTools) has a discoverable trigger, or it's removed.

**5.6 Every icon-only control has a tooltip + aria-label.**

**5.7 Everything splittable is draggable** — GraphQL, Workflow, Env, request/response all get resize handles (request/response already has one).

---

## 6. Implementation backlog

Ordered for **"upodobnienie ergonomii do Postmana"** as the overriding goal. Effort: **S** ≤ half-day, **M** ~1–2 days, **L** ~3+ days.

| # | Item | Sev | Effort | Notes |
|---|---|---|---|---|
| 1 | Lift dark surface scale (`--lok-bg-*`) + lighten borders; add "Pure black" pref | P1 | S | §2.1 — kills "za ciemno" in one token change |
| 2 | Idle response = 44px strip (not 42% hero); expand-on-Send | P1 | M | §3.1 — biggest density reclaim |
| 3 | Define `.lok-btn` sm/md/lg + `.lok-input` (34/40px) primitives; refactor toolbar onto them | P1 | M | §4.1/4.2 — fixes "przyciski za małe" |
| 4 | One-line request bar: URL flex:1 min-320, secondary→`⋯` overflow, Send never shrinks | P1 | M | §3.1 + shot 15 priority inversion |
| 5 | Overlay-not-layout-shift rule for URL/autocomplete/popovers | P1 | M | §5.1 — the flagged bug |
| 6 | "One hot thing": URL→neutral mono, empty headlines→solid, heat only on Send/Run/active | P1 | S | §2.5 |
| 7 | Borderless KV table `.lok-kv` (Params/Headers/Env), 34px rows | P1 | M | §4.3 |
| 8 | Fix dark URL box in light theme (CodeMirror bg per theme) | P1 | S | shot 14 bug |
| 9 | Fix i18n leaks (Zmienne/Sekrety/Wszystkie/Ten request/Dev-Tools/JWT + literal tabs) | P1 | S | §5.4 |
| 10 | Style React-Flow Controls to dark theme (white strip bug) | P1 | S | shots 06/11 |
| 11 | Sidebar → 280px, collapsible, 34px rows | P2 | M | §3.3 |
| 12 | Draggable splits: GraphQL / Workflow / Env | P2 | M | §5.7 |
| 13 | Single CTA per empty state; per-context icons (kill `~` reuse) | P2 | M | §4.5 |
| 14 | Workflows Run → heat `lg`; sidebar shows workflow list in Workflows mode | P2 | S | §3.5/3.3 |
| 15 | GraphQL: neutral headlines + starter query + idle strip | P2 | S | §3.4 |
| 16 | Import modal: content-height or add parsed preview; fix tab affordance | P2 | S | §3.8 |
| 17 | Wire (or remove) DevTools drawer trigger | P2 | S | §3.11/5.5 |
| 18 | Tab bar 38px + 13px labels; response tabs raised | P2 | S | §4.4 |
| 19 | Status bar: wire HTTP/latency or hide placeholders | P3 | S | §3.10 |
| 20 | Palette input focus-only ring; drop position to 15% | P3 | S | §3.9 |
| 21 | Elevation via luminance+shadow, remove most hairline borders | P3 | M | §2.4 |
| 22 | Tooltips on all icon-only buttons | P3 | S | §5.6 |
| 23 | Typography floor: no 11px on repeated-read text | P3 | S | §2.2 |

### TOP 10 quick wins (max ergonomic gain, low effort)
1. **Lift the dark surface scale** (#1) — one token edit, instantly less "za ciemno."
2. **Idle response = strip, not 42% hero** (#2) — reclaims a third of the window for the request.
3. **URL → neutral mono; heat only on Send/Run** (#6) — the accent finally means "action."
4. **Fix the dark-URL-box-in-light-theme bug** (#8).
5. **Fix all i18n leaks** (#9) — removes the glaring Polish-in-English strings.
6. **Style the React-Flow Controls** (#10) — kills the white strip.
7. **`.lok-btn`/`.lok-input` primitives, Send→40px** (#3) — the "buttons too small" fix, applied to the toolbar first.
8. **URL flex:1 + `⋯` overflow so it never gets squeezed** (#4, first slice) — fixes the narrow-window priority inversion.
9. **Overlay-not-layout-shift for the URL field** (#5) — the exact bug the user screenshotted.
10. **One CTA per empty state; per-context icons** (#13, first slice) — kills the double-"New request" and the reused tilde.

---

## 7. Screenshot index (`./shots/`)
| File | View / state |
|---|---|
| 01-empty-start-dark-1440 | First-run empty state (dark) — the black void + double CTA |
| 02-workbench-rest-params-1440 | REST workbench, Headers tab — URL overflow near tabs, 42% empty response |
| 03-params-populated-1440 | Params KV table populated — boxed cells, magenta URL |
| 04-response-state-1440 | Response error banner (Tauri absent) |
| 05-graphql-explorer-1440 | GraphQL 3-column — two heat headlines, blank editor |
| 06-workflows-canvas-1440 | Workflows canvas — strong view; white RF Controls; green Run |
| 07-command-palette-1440 | ⌘K palette — the quality bar |
| 08-import-modal-1440 | Import modal — over-tall, tab affordance |
| 09-env-manager-empty-1440 | Env manager empty — double "New environment" |
| 10-env-manager-editor-1440 | Env manager (empty editor state) |
| 11/12-history-drawer-1440 | History drawer (dark) + workflow RF Controls |
| 13-workbench-light-1440 | Light theme + History drawer — Polish "Wszystkie/Ten request" leak |
| 14-workbench-light-clean-1440 | Light theme workbench — **dark URL box bug**, calmer surfaces |
| 15-workbench-narrow-1100 | Narrow window — toolbar crowding, URL priority inversion |
