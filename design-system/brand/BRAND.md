# Ether — Brand Mark

> Local API client for macOS. `curl` under the hood, a precision instrument on top.

> **Rebrand note (Lokówka → Ether).** The product is now **Ether** — "requests
> into the void, nothing escapes your machine." The **coil/spiral mark survives
> the reframe unchanged**: it now reads as a spiral drawn in the void / the arc
> of a request that leaves and returns. Do **not** redraw the mark for the
> rename. The full "glow in the void" OLED re-theme and heat-ramp palette rename
> below are a **separate follow-up epic**; this doc keeps the current palette and
> updates the name + thesis only.

## The mark

A single **heated filament that coils into one tight curl**. It rises as a cool
magenta barrel and coils into a white-hot amber tip: the brand's
[**heat ramp**](../MASTER.md#14-the-heat-ramp--the-brand) made literal. A short
slash crosses the barrel base, giving the mark a struck, engraved,
instrument-precise read.

The mark carries three readings at once, on purpose:

1. **A spiral / coil** — an arc drawn in the void, the *Ether* thesis.
2. **A crossed spine** — spine + slash, an engraved, instrument-precise mark.
3. **A request arc** — a signal that leaves and comes back, the shape of an API
   round-trip (Send → Wait/TTFB → Download), which is exactly what the app colors
   with this same gradient in its waterfall.

It sits on a **deep OLED squircle body** (`#05070b → #141824`, cool-tilted so it
never reads as flat black) with one quiet **heat bloom** anchored top-right — the
same corner where **Send** lives in the app. A near-invisible instrument grid and a
top specular sheen give it the tactile, premium feel of a macOS pro tool, not a
generic gradient blob.

**Why it's distinctive:** the entire body is dark and cold; the *only* thing that
glows is the coil. Color always means "hot / on." That single warm accent on an
otherwise cold, borderless-by-elevation dark is the whole brand — and it survives
the shrink: the incandescent tip keeps the mark legible and recognizable at 16px
(Dock small / menu bar) all the way up to 1024px.

## Files

| File | What |
|---|---|
| `icon.svg` | Vector app icon, `viewBox 0 0 1024 1024`. Full squircle body + heat mark. Source of truth. |
| `icon-render.html` | Zero-margin 1024×1024 page embedding the SVG, body = icon floor. For rasterization. |
| `icon-1024.png` | 1024×1024 raster (rendered via Playwright from `icon-render.html`). Feed to `iconutil` / `.icns` pipeline. |

## Colors (hex)

Pulled 1:1 from the [design system heat ramp](../MASTER.md#14-the-heat-ramp--the-brand)
and surface floor. Do not introduce new hues in the mark.

### Heat ramp (the coil, base → tip)

| Role | Hex |
|---|---|
| Base / brand primary (magenta) | `#ff2d7a` |
| Warm mid | `#ff3f63` |
| Red-orange | `#ff5f2c` |
| Orange | `#ff8a12` |
| Hot tip (amber) | `#ffb60a` |
| Incandescent core highlight | `#ff9166` → `#ffe0a0` |
| Tip cap glow / center | `#ffd489` / `#fff6de` |

### Body & atmosphere

| Role | Hex / value |
|---|---|
| Squircle floor top | `#141824` |
| Squircle floor mid | `#0b0e16` |
| Squircle floor bottom | `#05070b` |
| Ambient heat bloom (top-right) | `#ff2d7a` @ 30% → `#ffa60a` @ 0% |
| Instrument grid | `#ffffff` @ 2.8% |
| Top specular sheen | `#ffffff` @ 10% → 0% |
| Inner hairline bevel | `#ffffff` @ 6% |

## Usage

**Do**
- Ship the **full-body squircle** as the primary macOS app icon (`.icns` / Dock /
  Finder / DMG). macOS applies its own mask; the built-in squircle keeps the mark
  centered and safe.
- Keep the mark on a dark, cold surface. The coil is the only thing allowed to glow.
- For a monochrome / glyph context (menu-bar template, favicon stroke), use the
  coil path alone in a single ink; drop the body, bloom, and grid.

**Don't**
- Don't put the mark on a transparent background for the *app icon* — macOS app
  icons use a filled body (the squircle **is** the icon).
- Don't recolor the coil outside the heat ramp, add extra hues, or turn the whole
  body into a rainbow gradient — heat is information, not decoration.
- Don't rotate, add drop shadows beyond the built-in glow, or stretch the squircle.

## Regenerating the PNG

```bash
cd design-system/brand
python3 -m http.server 8749 &            # serve locally (file:// is blocked in Playwright)
# Playwright: navigate http://127.0.0.1:8749/icon-render.html
#            resize 1024×1024, screenshot -> icon-1024.png (scale: css)
```

Then feed `icon-1024.png` into the `.icns` pipeline (`sips` / `iconutil`) for the
Tauri bundle.
