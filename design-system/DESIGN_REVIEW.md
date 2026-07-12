# Lokówka — Design System v2 · Design & A11y Review

**Reviewer:** Opus (art-director + a11y/QA gate) · rendered live in Chromium @ 1440×900, dark + light
**Method:** Playwright render of `preview/{index,mock-request,mock-graphql}.html` → visual pixel review + programmatic WCAG contrast math (relative-luminance, sRGB) on every suspect text/background pair.
**Benchmark:** Linear · Raycast · Warp · TablePlus · Postman/Insomnia.

---

## Verdict: **SHIP** (after the fixes applied in this review)

This is a *genuine* precision-tool aesthetic, not generic bootstrap. The previous design was rightly rejected; this is a different league. The OLED-deep floor, the single reserved "heat" accent used only for meaning (Send, active env, progress, the wait/download waterfall phases), the mono-where-it-counts typography with tabular-nums, the macOS titlebar + status bar chrome, and the response-dock waterfall all read as a serious developer instrument. It stands next to Warp/TablePlus without embarrassment.

Two real defects were found and **fixed in this pass** (contrast on the pervasive tertiary text; a broken row in the GraphQL tree). What remains for a later pass is polish (P2), not blockers.

---

## Strong points (what makes it not-generic)

- **Disciplined color economy.** Heat gradient (magenta→red-orange→amber, "curling iron heating up") is reserved for exactly the four meaningful things. Everything else is cold neutral ink. Color *means* a method/status/phase — it never decorates. This is the single biggest reason it reads premium.
- **Response-dock waterfall.** Proportional phase bars with cool setup phases and a hot TTFB/download tail is both beautiful and *legible as data*. This is the signature moment and it lands.
- **Typography split is correct.** Sans for chrome, mono for anything that is code or a number; tabular-nums on all metrics (time/size/ms/waterfall). Line-height and tracking are tuned, not default.
- **Chrome is convincing.** macOS traffic lights, drag titlebar, env pill with colored dot + halo, and a dense status bar (`libcurl 8.7.1 · HTTP/2 · TLS 1.3`) sell the "native tool" story.
- **Method + status hues** are fixed-per-verb and each pairs with an icon + text label (never color-only) — passes the color-blind guideline.
- **GraphQL explorer** three-pane (field tree w/ checkboxes → editor+variables → docs explorer) is a real GraphiQL-class layout, tastefully restrained.
- **Light theme holds up** — it re-maps to a clean TablePlus-white without the accent going candy. Both themes are first-class.
- **Motion tokens + `prefers-reduced-motion` hard gate** present in tokens; dock-rise / status-pop are tasteful, not gratuitous.

---

## Contrast audit (measured, not eyeballed)

WCAG 2.1 ratios computed in-page against the actual token values. AA normal text = 4.5, AA large/AA-graphics = 3.0.

### Fixed in this review

| Pair | Before | After | Note |
|---|---|---|---|
| `text-tertiary` (ink-600) on `bg-surface` | **3.85 ✗** | **5.58 ✓** | Most pervasive text color in the whole system (all section copy, table meta, tab labels, waterfall labels, curl log, status bar, GraphQL ftypes/docs). Was failing AA. `#6b7280 → #868d9c`. |
| `text-tertiary` on `bg-app` | 4.17 ✗ | 6.05 ✓ | same token |
| `text-tertiary` on `bg-sidebar` | ~4.0 ✗ | 5.83 ✓ | same token |
| line numbers / `text-disabled` (ink-500) on `bg-code` | **2.60 ✗** | **3.18 ✓ (AA-Large)** | JSON/GraphQL gutter line numbers were near-invisible. `#4d5566 → #5b6273`. |
| Send button white label over amber gradient tail | 1.96 ✗ (edge) | mitigated | Added `text-shadow` so white stays legible across the whole heat fill regardless of where the label sits. |

### Already passing (kept)

| Pair | Ratio |
|---|---|
| `text-secondary` (ink-800) on surface | 11.18 |
| heat-400 eyebrow on app | 6.97 |
| heat-300 link / btn.subtle on surface | 8.93 |
| method GET green / on surface | 10.52 |
| method POST + warn amber / on surface | 11.23 |
| danger red / on surface | 6.70 |
| syntax key pink / string green on code | 9.33 / 11.00 |
| white on heat-500/600 (Send label region) | ~4.14 (AA-large / graphics OK) |

**Remaining contrast note (P2):** `--lok-text-disabled` at 3.18 clears AA-Large only. That is acceptable for genuinely-disabled controls and gutter line numbers, but do **not** reuse this token for any meaningful body text.

---

## Critical fixes

### P0 — applied ✅
1. **Tertiary text failed AA everywhere.** `--lok-ink-600` `#6b7280 → #868d9c`.
   Files: `src/styles/tokens.css`, `design-system/preview/style.css`.
2. **Line numbers invisible (2.6:1).** `--lok-ink-500` `#4d5566 → #5b6273`.
   Files: `src/styles/tokens.css`, `design-system/preview/style.css`.

### P1 — applied ✅
3. **GraphQL `organization` row was structurally broken** — a stray `<input type="checkbox">` was nested *inside* the disclosure-chevron `<svg>`, which swallowed the chevron and misaligned the row vs `roles`/`users`. Fixed the markup so `organization` now renders its `›` chevron and aligns.
   File: `design-system/preview/mock-graphql.html`.
4. **Send button legibility over the amber gradient tail.** Added a subtle `text-shadow` to `.btn-send` so the white label/icon stay AA-legible across the full heat fill (the gradient ends at `#ffa60a`, where white alone is 1.96:1).
   File: `design-system/preview/style.css`.

### P2 — recommended, not applied (polish for next pass)
5. **Light-mode surface swatches** (`bg-surface` / `bg-raised` / `bg-overlay`) are nearly indistinguishable white-on-white in the styleguide "Surfaces" strip. They separate fine *in context* (shadows do the work), but the swatch demo under-sells the elevation model — consider a hairline + drop-shadow on each swatch in light, or annotate that light elevation is shadow-driven not luminance-driven.
6. **Light-mode glass toasts** are very faint (low-alpha glass on light bg). Bump `--lok-glass-bg` opacity or add a stronger border in light.
7. **Empty-state CTA** uses `btn.subtle` (heat-tint) — consider whether the primary empty-state action should be a full `btn-send`-weight heat button to pull the eye; currently the halo is the loudest thing and the CTA is quiet.
8. **Waterfall `Wait·TTFB` label** wraps tight in the 88px label column at some zooms; give the label column `min-width` breathing room or truncate with tooltip.
9. **`text-shadow` on `.btn-send`** is a legibility patch, not the ideal — the *cleaner* long-term fix is to end the Send-button gradient at heat-700 (`#ff5236`) instead of heat-900 amber, reserving the full magenta→amber ramp for the decorative hero/heat-strip only. Keep the amber for progress bars where there's no text on top.

---

## Consistency / craft notes (no action required, for the record)
- Icon set is coherent (single Lucide-style stroke family, 1.5 stroke). ✓
- Radii, spacing, and elevation tokens are used consistently across styleguide and both mockups. ✓
- Interaction states (hover/active/focus/disabled) are all defined; focus ring is the heat color at 3px — visible and on-brand. ✓
- Selection color, scrollbar theming, and reduced-motion are all handled. ✓

---

## Screens

Rendered at 1440×900, `scale: device` (Retina), in `preview/shots/`:

| File | What |
|---|---|
| `shots/index-dark.png` | Full styleguide, dark (post-fix) |
| `shots/index-light.png` | Full styleguide, light |
| `shots/mock-request-dark.png` | Request Workbench, dark (post-fix) |
| `shots/mock-request-light.png` | Request Workbench, light |
| `shots/mock-graphql-dark.png` | GraphQL Explorer, dark (post-fix, org-row fixed) |
| `shots/mock-graphql-light.png` | GraphQL Explorer, light |

---

*Contrast math and all six renders produced live via Playwright; token edits verified by re-render + re-measure (tertiary 3.85→5.58, line-numbers 2.60→3.18).*
