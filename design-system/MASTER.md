# Lokówka — Design System v2 (MASTER)

> Local API client for macOS. Tauri v2 + WKWebView, **libcurl** under the hood.
> This is the single source of truth for the visual system. Every value here maps
> 1:1 to a CSS custom property in [`src/styles/tokens.css`](../src/styles/tokens.css)
> (namespace `--lok-*`). Components reference **semantic** tokens only.

---

## 0. Philosophy — what makes us distinctive

Lokówka looks like a **precision instrument, not a dashboard.** The screen is a
deep OLED floor (`#060709`) that reads as *empty until something is "on."* The
one thing that glows is the brand: a **heat gradient** (magenta → red-orange →
amber, "a curling iron heating up") reserved for exactly four things — **Send**,
the **active/progress** state, the **waterfall wait/download** phases, and the
**live env accent**. Everything else is quiet, dense, monospaced-where-it-counts
neutral ink. The result is calm, technical, and legible at a glance: color always
*means* something (a method, a status, a phase), never decorates. That restraint —
one warm accent on an otherwise cold, borderless-by-elevation dark — is what
separates us from the generic neon-everything AI dashboard.

**Three rules that hold the whole thing together**

1. **Color is information, never decoration.** Heat = "on/hot". A hue always
   encodes a method, a status class, or a timeline phase.
2. **Elevation by light, not by border.** Surfaces step up in luminance
   (`ink-0 → ink-200`); hairline borders are a whisper, used only where light
   alone can't separate.
3. **Motion earns its place.** Three "wow" moments only (Send, response arrival,
   env switch). Everything else is a 140 ms hover. `prefers-reduced-motion` kills
   all of it.

---

## 1. Color

### 1.1 Surfaces (dark — default)

Elevation reads by luminance; back → front. No borders needed between adjacent
levels on OLED.

| Token | Hex | Use |
|---|---|---|
| `--lok-bg-app` (`ink-0`) | `#060709` | Window backdrop, behind everything |
| `--lok-bg-sidebar` (`ink-50`) | `#0b0d12` | Collections rail |
| `--lok-bg-surface` (`ink-100`) | `#101319` | Editor & response panels |
| `--lok-bg-raised` (`ink-150`) | `#161a22` | Cards, toolbars, tabs |
| `--lok-bg-overlay` (`ink-200`) | `#1d222c` | Dropdowns, popovers, menus |
| `--lok-bg-input` | `#161a22` | Inputs (raised from surface) |
| `--lok-bg-code` (`ink-50`) | `#0b0d12` | Response / curl panes |
| `--lok-bg-hover` | `rgba(255,255,255,.04)` | Row / control hover |
| `--lok-bg-active` | `rgba(255,255,255,.07)` | Pressed / active row |
| `--lok-bg-selected` | `rgba(255,45,122,.12)` | Heat-tinted selection |
| `--lok-scrim` | `rgba(6,6,10,.66)` | Modal / palette backdrop |

**Surfaces (light)** — `app #f4f4f7`, `sidebar #ececef`, `surface #ffffff`,
`raised #f7f7f9`, `overlay #ffffff`, `code #fafafc`.

**Ambient bloom** (`--lok-gradient-ambient`) — one radial heat bloom anchored
top-right (where Send lives), `rgba(255,45,122,.055) → rgba(255,122,31,.03) →
transparent`. Kept < 6% so it reads as *light*, not color. This is the entire
"atmosphere" — no busy gradients anywhere else.

### 1.2 Borders & dividers (dark)

| Token | Value |
|---|---|
| `--lok-border-subtle` | `rgba(255,255,255,.06)` |
| `--lok-border-default` | `rgba(255,255,255,.10)` |
| `--lok-border-strong` | `rgba(255,255,255,.16)` |
| `--lok-border-focus` | `--lok-heat-500` (`#ff2d7a`) |

### 1.3 Text (dark) — all AA+ on their intended surface

| Token | Hex | Contrast on `#101319` |
|---|---|---|
| `--lok-text-primary` (`ink-950`) | `#f5f7fa` | ~17:1 (AAA) |
| `--lok-text-secondary` (`ink-800`) | `#c3c9d4` | ~11:1 (AAA) |
| `--lok-text-tertiary` (`ink-600`) | `#6b7280` | ~4.9:1 (AA) |
| `--lok-text-disabled` (`ink-500`) | `#4d5566` | decorative only |
| `--lok-text-on-heat` | `#ffffff` | on heat fills |
| `--lok-text-link` | `#ff93b4` (dark) / `#d6146a` (light) | AA |

### 1.4 The Heat ramp — the brand

Cool magenta → hot amber, "rozgrzana lokówka." Used **sparingly**: Send,
active/progress, waterfall wait+download, live env pill.

| Stop | Hex | Role |
|---|---|---|
| `--lok-heat-200` | `#ffc4d6` | Text-gradient top, faint glow |
| `--lok-heat-300` | `#ff93b4` | Links (dark), glow ring |
| `--lok-heat-400` | `#ff5f8c` | Brand hover |
| `--lok-heat-500` | `#ff2d7a` | **PRIMARY brand / gradient start** |
| `--lok-heat-600` | `#f01e64` | Pressed brand |
| `--lok-heat-700` | `#ff5236` | Gradient mid (red-orange) |
| `--lok-heat-800` | `#ff7a1f` | Gradient near-end (orange) |
| `--lok-heat-900` | `#ffa60a` | Gradient end / hottest (amber) |

**Signature gradients**
- `--lok-gradient-heat` — `linear-gradient(135deg, heat-500 0%, heat-700 55%, heat-900 100%)` — Send, active env, progress fill.
- `--lok-gradient-heat-x` — horizontal, for linear meters.
- `--lok-gradient-heat-glow` — radial, behind the logo / focused Send / empty-state hero.
- `--lok-gradient-heat-text` — `heat-300 → heat-900`, painted into text via `background-clip: text`.
- `--lok-gradient-heat-line` — transparent → heat → transparent hairline under the active tab.

### 1.5 Semantic status hues (AA on dark; deepened for AA on white)

| Meaning | Dark | Light | HTTP class |
|---|---|---|---|
| success | `#3ddc97` | `#0f9d63` | 2xx / pass / connected |
| info | `#5aa8ff` | `#2563eb` | 3xx / info / redirect |
| warn | `#ffbe3d` | `#b45309` | 4xx / warning / expiring |
| danger | `#ff6b6b` | `#dc2626` | 5xx / fail / error |
| neutral | `#8a90a0` | `#6a6a7d` | 1xx / no-status / disabled |

Each has a matching `-bg` tint at ~14% for badge fills. **Never color-only:** every
status pairs with an icon + label (a11y rule).

### 1.6 HTTP method colors

Fixed per verb — a method reads at a glance in the tree, toolbar, and curl log.
Rendered as a badge: hue text on a ~10% tint of that hue.

| Verb | Dark | Light | Meaning |
|---|---|---|---|
| `GET` | `#3ddc97` | `#0f9d63` | safe / read |
| `POST` | `#ffbe3d` | `#b45309` | create |
| `PUT` | `#5aa8ff` | `#2563eb` | replace |
| `PATCH` | `#a78bfa` | `#7c3aed` | partial |
| `DELETE` | `#ff6b6b` | `#dc2626` | destroy |
| `HEAD` | `#22d3ee` | `#0e7490` | — |
| `OPTIONS` | `#8a90a0` | `#6a6a7d` | — |

### 1.7 Waterfall phase colors

Setup phases stay cool; the phases you *wait on* glow with the brand heat.

| Phase | Hex | Hue |
|---|---|---|
| DNS | `#a78bfa` | violet |
| Connect (TCP) | `#5aa8ff` | blue |
| TLS | `#22d3ee` | cyan |
| Wait / TTFB | `#ff2d7a` | magenta (heat) |
| Download | `#ffa60a` | amber (heat) |

### 1.8 Environment accent hues

The env-switcher pill and its live health dot take one of these. Components read
`--lok-env-accent`; the app sets it per active env.

| Env | Hex |
|---|---|
| local | `#3ddc97` (green — safe) |
| dev | `#5aa8ff` (blue) |
| staging | `#ffbe3d` (amber) |
| **prod** | `#ff6b6b` (red — be careful) |
| custom | `#a78bfa` (violet) |

---

## 2. Typography

Two families. **Sans** for UI chrome. **Mono** for anything that is code, a
response, a header value, a curl command, or a *number* (timings, sizes, status).

- **Sans:** `-apple-system, "SF Pro Text/Display", system-ui, "Inter", …` — native
  macOS first (the app is macOS-only), Inter as the cross-platform fallback.
- **Mono:** `"SF Mono", "JetBrains Mono", "Menlo", "Cascadia Code", ui-monospace, …`

**Tabular numbers are mandatory** anywhere digits change or align: timers,
`p50/p95/p99`, sizes, status codes, waterfall ms, table numeric cells. Apply
`font-variant-numeric: tabular-nums` (utility `.lok-tnums`).

### 2.1 Scale — 1.25 (major third) around a 13px macOS-dense UI base

| Token | px / rem | Use | Line-height |
|---|---|---|---|
| `--lok-fs-2xs` | 11 / .6875 | micro labels, badges, curl gutter | `--lok-lh-tight` |
| `--lok-fs-xs` | 12 / .75 | secondary meta, table cells | 1.35 |
| `--lok-fs-sm` | 13 / .8125 | **BASE UI text** | 1.5 |
| `--lok-fs-md` | 15 / .9375 | inputs, request URL | 1.5 |
| `--lok-fs-lg` | 18 / 1.125 | section titles | 1.35 |
| `--lok-fs-xl` | 24 / 1.5 | empty-state headline | 1.2 |
| `--lok-fs-2xl` | 32 / 2 | hero / big status code | 1.2 |

Line-heights: `tight 1.2`, `snug 1.35`, `base 1.5`, `code 1.55`.

### 2.2 Weights & tracking

Weights: `regular 400`, `medium 500`, `semibold 600`, `bold 700`. Prefer 400/500
for body/UI; 600 for titles; 700 only for the hero status code / brand wordmark.

Tracking: `tight -0.01em` (large sans), `normal 0`, `wide 0.02em` (uppercase micro),
`caps 0.06em` (ALL-CAPS eyebrow labels — the only place we uppercase).

---

## 3. Spacing, radius, elevation, blur

- **Spacing** — strict **4 px** base grid: `0,4,8,12,16,20,24,32,40,48,64`
  (`--lok-space-0…16`). Dense macOS layout: default gutter 8–12 px, panel pad 16.
- **Radius** — `xs 3` (chips), `sm 5` (inputs/buttons/rows), `md 8` (cards/pills),
  `lg 12` (modals/⌘K/glass HUD), `xl 16` (large surfaces), `full 999`.
- **Elevation (shadows, dark)** — soft, cool, dark-tuned:
  `xs 0 1px 2px /.4` · `sm 0 2px 6px /.45` · `md 0 8px 24px /.5` · `lg 0 20px 60px /.6`.
  Heat accent shadow (Send hover glow): `--lok-shadow-heat 0 6px 22px rgba(255,45,122,.32)`.
  Focus: `--lok-shadow-focus 0 0 0 3px var(--lok-focus-ring)`.
- **Glass / blur** — HUD & ⌘K palette: `--lok-glass-bg rgba(22,26,34,.72)`,
  `--lok-glass-border rgba(255,255,255,.09)`, `--lok-glass-blur 22px`
  (`backdrop-filter: blur(22px)`). Use blur *only* on the palette and the
  post-request HUD — never on scrolling content (perf).

---

## 4. Iconography

- **Lucide**, stroke width **1.5**, `currentColor`, 16 px in dense chrome / 20 px in
  toolbars / 24 px in empty states. Never emoji-as-icon (a11y + rendering).
- Ship as **inline SVG** in the app (tree-shaken); the previews inline the exact
  paths so they render on `file://` with no CDN.
- Method/status never rely on the icon alone — icon **and** text label together.

---

## 5. Motion

Durations: `instant 80ms` (focus ring, checkbox) · `fast 140ms` (hover, tab) ·
`base 220ms` (panel/pill, env swap) · `slow 340ms` (response arrival, HUD) ·
`slower 520ms` (waterfall bars filling in sequence).

Easings:
- `--lok-ease-standard` `cubic-bezier(.2,0,0,1)` — most UI enters.
- `--lok-ease-decelerate` `cubic-bezier(.16,1,.3,1)` — **things arriving** (cinematic expo-out).
- `--lok-ease-accelerate` `cubic-bezier(.3,0,1,1)` — things leaving.
- `--lok-ease-spring` `cubic-bezier(.34,1.56,.64,1)` — **wow-moments**.

**The three wow-moments (and nothing else animates beyond a hover):**

1. **Send** — press scales `0.97 → 1.0` (`dur-fast`, spring), heat glow blooms
   under the button; a heat progress line sweeps the toolbar while in flight.
2. **Response arrival** — the response dock rises + fades in (`dur-slow`,
   decelerate); the status badge pops `1.0 → 1.02 → 1.0` (spring); waterfall bars
   fill left-to-right in phase order over `dur-slower`.
3. **Env switch** — the env accent cross-fades and the pill morphs (`dur-base`,
   standard); a single ambient sweep of the new accent crosses the topbar.

**`prefers-reduced-motion: reduce` → all transitions/animations collapse to
`0.01ms`** (opacity swaps only, no transforms, no bar-fill choreography). Hard gate,
enforced in `base.css`.

---

## 6. Accessibility rules (non-negotiable)

- **Contrast:** body text ≥ 4.5:1 (AA); primary/secondary text hit AAA on dark.
  Status/method hues verified AA as text on their surface (and deepened on light).
- **Never color-only:** status, method, and env always carry an icon + text label.
- **Focus-visible:** every interactive element shows `--lok-shadow-focus` (3px heat
  ring) on `:focus-visible`; `outline` is never removed without this replacement.
- **Keyboard:** full traversal; ⌘K palette is the keyboard-first entry point; visible
  focus order matches DOM order.
- **Reduced motion:** hard gate (see §5).
- **Tabular numbers** everywhere digits align/change — prevents jitter and
  misreads on timings and sizes.
- **Hit targets:** ≥ 24 px in dense chrome, ≥ 32 px for primary actions.
- **App shell:** `100dvh`, **no scrollable window** — only inner panels scroll
  (`overflow` on the panel, never the body). Fixed titlebar + status strip.

---

## 7. Layout dimensions

`sidebar 260px` (min 200 / max 420) · `response dock 480px` (right) or `42%`
(bottom) · `titlebar 40px` (macOS traffic-light padding) · `toolbar 44px`
(method+URL+Send) · `tabbar 34px` · `statusbar 26px`.

Z-index: `base 0` · `sticky 10` · `dropdown 100` · `hud 500` · `modal 1000` ·
`palette 1100` · `toast 1200`.

---

## 8. Files

| File | Purpose |
|---|---|
| `src/styles/tokens.css` | Live tokens (`--lok-*`), dark `:root` + `[data-theme=light]` |
| `design-system/preview/index.html` | Renderable styleguide (colors, type, components) |
| `design-system/preview/mock-request.html` | Request Workbench full-screen mockup |
| `design-system/preview/mock-graphql.html` | GraphQL Explorer full-screen mockup |
| `design-system/preview/style.css` | Self-contained token copy + preview styles |

All preview pages open directly on `file://` (no build, no CDN, inline SVG icons).
