# Ether — UX-Polish R2 Review (PR #34)

**Reviewer:** ux-designer (team `ether-ux-polish`)
**Date:** 2026-07-13
**PR:** [#34](https://github.com/bryndalski/lokowka/pull/34) `feat/ux-polish` @ `2fa8d77`
**Method:** `npm ci` → `typecheck` → `test:unit` in the branch worktree, then a fresh dev server on **:1421** serving the branch, re-rendered the same 8 states at **1440×900** (dark + light) via Playwright MCP, with computed-style contrast probes. Baseline = `docs/design/ux-audit-r1.md`.

## Verdict: ✅ PASS

Every **P0** and every in-scope **P1** from R1 is verified — rendered *and* measured — in both themes. No regressions. Local gate green. The app now holds the "premium instrument" bar it was missing in R1: the one brand accent is spent sparingly, semantic color tells the truth, and light theme is legible. Clear to proceed (no merge performed — per protocol, that's the user's call).

## Local gate

| Check | Result |
|---|---|
| `npm ci` | ✅ 247 pkgs, 0 vuln |
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| `npm run test:unit` (vitest) | ✅ **383/383** (71 files) |
| Rust | untouched (CSS/tokens/i18n/composition only) — correctly skipped |

## Fix verification (rendered + measured)

| ID | Fix | Evidence | Status |
|---|---|---|---|
| **P0-1** | Heat glow muddy + over-used | GraphQL went **4 blooms → 1** (Fields/Docs now glow-less text; only Response keeps a subtle haze). `.lok-heat-glow` blur 44px, opacity .30 dark / .16 light. Coffee-stain gone in **both** themes. | ✅ |
| **P0-2** | Green "No environment" lie | `--lok-env-accent` = `#8a90a0` (dark) / `#6a6a7d` (light), `data-env="none"`, status dot `rgb(138,144,160)` — neutral gray, green eliminated. | ✅ |
| **P0-3** | Double hero empty-state | Sidebar is now a **compact** `<p>` + quiet ghost CTA (no glow); editor is the single glowing hero. | ✅ |
| **P1-4** | Polish aria-labels in EN | Tree "Collections", "Actions for New request", "Request type", "HTTP method", "Request URL", "Parameters" — all English. No PL leakage found. | ✅ |
| **P1-5** | Weak modal/palette scrim | App behind ⌘K palette and env modal is now visibly dimmed (vs fully bright in R1). Overlays float. | ✅ |
| **P1-6** | Env-manager empty void | Editor pane now shows a **centered hero**: globe icon + "No environments." + prominent "New environment" CTA. | ✅ |
| **P1-7** | Light heat-text headline (was ~2.1:1) | Light theme: `background-image: none`, solid `#14141a`. Contrast ≈ **16:1**. | ✅ |
| **P1-8** | Status strip small/sub-AA | Now `#868d9c`/`#0b0d12` @11.4px = **5.84:1** (dark); `#595966`/`#ececef` @11.4px = **5.84:1** (light, was 4.48:1 fail). | ✅ |

Screenshots: `docs/design/ux-shots-r2/` (compare against R1 `docs/design/ux-shots/`).

## Consciously de-scoped (team-lead scope call — NOT blockers)

Confirmed still open, acknowledged as out of this PR's scope:
- **P1-9** — per-context Lucide icons (the `~` tilde glyph is still reused across empty states).
- **P1-10** — toolbar tooltips (Save / Copy-as-cURL remain icon-only).
- **P2-11** — ⌘K palette input keeps an always-on magenta border (reads fine because the input is auto-focused on open).
- **P2-12..17** — selected-row accent bar, kbd-chip contrast, long-URL scroll reset, GraphQL editor placeholder, wide-viewport dead space, elevation seams.

Recommend these as a fast-follow polish pass. None affect correctness or a11y-blocking contrast.

## Notes
- Non-UX: GraphQL still throws the `ipc.ts:67 invoke` TypeError in-browser (Tauri absent) — cosmetic here, flagged in R1 for a `window.__TAURI__` guard. Not in this PR's scope.
- Review rendered on a throwaway dev server (`:1421`) from the branch worktree so the `main` baseline on `:1420` stayed untouched.
