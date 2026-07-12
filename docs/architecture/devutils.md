# Dev-Utils — Architecture Blueprint (mini-benchmark · JWT decoder · TLS cert viewer)

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + Tailwind v4 (utility-only) + design-system v2 (`--lok-*` tokens).
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored in `src/lib/types.ts`). **Never** invent a field.
> **IPC source of truth:** `src-tauri/src/lib.rs` (registered commands) + `src/lib/ipc.ts` (typed wrappers).
> **Companion blueprint:** `docs/architecture/request-workbench.md` — this doc extends Zone 2/3 (`RequestWorkbench`, `ResponseDock`) and reuses `useSendRequest`, `resolveAndSend`, `phaseSpans` (`src/lib/waterfall.ts`), `TimelineWaterfall`, `formatMs`/`humanBytes` (`src/lib/format.ts`), `httpStatus`.

Dev-Utils is a **frontend-only feature layer** — three inspector tools that read what the existing engine already returns and re-drive the existing send path. **No Rust / IPC changes are required.** Everything is built from data the FE already has:

- **Mini-benchmark** re-drives `resolveAndSend()` (the wrapper `useSendRequest.send` already calls) in a loop and does pure-math stats over each `ResponseData.timings.total_ms`.
- **JWT decoder** parses tokens already present in `ResponseData.headers` / `ResponseData.body` (or pasted by hand) — pure base64url decode, **no signature verification**, **no network, no logging**.
- **TLS cert viewer** renders `ResponseData.tls` (`TlsInfo{ protocol, cipher, verify_ok, cert_chain: string[] /* PEM */ }`) — protocol/cipher/verify badges plus a best-effort pure-JS PEM→DER→ASN.1 field extraction with a hard fallback to raw PEM + SHA-256 fingerprint.

Hard rules that govern everything below (from `design-system/MASTER.md` §6 and repo feedback):

- **1 component = 1 file.** All logic in hooks / `src/lib/*` pure fns; view files stay small (< ~100 lines) and dumb. Types at module scope.
- **Shell:** `100dvh`, **no scrollable window** — only inner panes scroll (`.lok-scroll`, `min-height:0` + `overflow:auto`). Dev-Utils lives inside panes that already obey this.
- **A11y non-negotiable:** `focus-visible` heat ring (free from `base.css`), `aria-*` on every icon-only button, AA contrast (semantic tokens only — never a raw hex), `prefers-reduced-motion` hard gate (free from `base.css`; histogram bar-grow and countdown pulse collapse to `0.01ms`).
- **Tabular numbers** (`.lok-tnums` / `font-variant-numeric: tabular-nums`) on **every** number: p50/p95/p99/min/max/avg, per-run ms, histogram axes, JWT `exp` countdown, TLS validity days, fingerprint.
- **Never color-only:** benchmark outlier flags, JWT status, and TLS verify all pair a hue with an icon **and** a text label.
- **Icons:** Lucide via the existing `<Icon>` sprite (`src/components/common/IconSprite.tsx`). Existing ids reused: `i-flame` (benchmark), `i-shield`/`i-lock`/`i-unlock` (TLS), `i-x`/`i-check`/`i-copy`/`i-refresh`. **New sprite symbols to add** (Lucide, stroke 1.5, `currentColor`): `i-bar-chart` (benchmark), `i-key` (JWT), `i-clock` (countdown), `i-alert` (warn/expired). No CDN — copy exact Lucide paths into `IconSprite.tsx`.
- **SECURITY — the token rule:** the JWT tool **NEVER** logs, persists, or transmits a token. No `console.log`, no history write, no store persistence, no IPC. Decode is 100% in-browser pure JS. Auto-detected tokens are held in component state only, never written back to the draft or Keychain.

---

## 0. Where it lives in the UI

Two placements, chosen per tool's data source:

| Tool | Placement | Why |
|---|---|---|
| **Mini-benchmark** | (1) a **"Benchmark" button in the `RequestBar`** next to `SendButton`, plus (2) a **results panel inside the `ResponseDock` as a new tab** (`Bench`). | Benchmark re-runs the *current request*, so it belongs on the request toolbar; results are per-request response data, so they render in the dock alongside the normal response. |
| **JWT decoder** | A **new `ResponseDock` tab** (`JWT`) — shown only when a token is auto-detected — **and** a manual-paste box always reachable from the **Dev-Tools drawer**. | Detected tokens are response-scoped (dock); manual decode is a standalone utility (drawer). |
| **TLS cert viewer** | A **new `ResponseDock` tab** (`Cert`) — shown only when `response.tls != null`. | The cert is a property of the just-completed response. |

Plus a single **Dev-Tools drawer** (`src/components/devtools/DevToolsDrawer.tsx`) — a right-side slide-over (same pattern as `HistoryDrawer`: `role="dialog"`, `aria-modal`, Escape/scrim close, only inner list scrolls) that hosts the **standalone JWT paste-decode** and a **benchmark config/history** surface, so the tools are reachable even with no active response. Opened from a titlebar/statusbar icon button and the ⌘K palette.

### 0.1 ResponseDock tab strip (extended)

`src/components/response/ResponseTabs.tsx` currently renders `Body | Headers | Timeline | curl -v`. Extend `ResponseTabKey` and the `TABS` array with **conditional** tabs (only rendered when their data exists — do not show empty tabs):

```
Body | Headers | Timeline | curl -v | [Bench?] | [Cert?] | [JWT?]
```
- `Bench` — present when a benchmark run exists for this response's request (from `useBenchmark` state, passed into the dock).
- `Cert` — present when `response.tls != null`.
- `JWT` — present when `detectJwtCandidates(response)` returns ≥ 1 candidate.

`ResponseTabs` gets new props: `showBench: boolean; showCert: boolean; jwtCount: number` (drives a `.count` chip on `JWT`). Arrow-key `role="tablist"` navigation and `aria-selected` already exist — extend the array, keep the semantics.

---

## 1. Component tree

Directory: `src/components/devtools/` (new). Each row = one file, view-only; logic lives in `src/hooks/*` and `src/lib/*`.

```
DevToolsDrawer                       (right slide-over; hosts standalone tools)
├── devtools/DevToolsDrawerHeader    (title + close ✕)
├── devtools/JwtPasteDecoder         (textarea → useJwtDecoder → JwtClaimsView)
└── devtools/BenchmarkLauncher       (config: N, concurrency; "Run benchmark" w/ warning)

RequestBar  (existing — add one button)
└── devtools/BenchmarkButton         (Icon i-bar-chart + "Benchmark"; disabled when URL empty / in-flight)

ResponseDock  (existing — 3 new conditional tabs mount these)
├── devtools/BenchmarkPanel          (Bench tab)
│   ├── devtools/BenchmarkProgress    (x/N + Cancel while running)
│   ├── devtools/BenchmarkStats       (p50/p95/p99/min/max/avg cards — tabular-nums)
│   ├── devtools/LatencyHistogram     (pure SVG histogram + p50/p95/p99 lines)
│   └── response/TimelineWaterfall    (REUSED — waterfall of the selected sample)
├── devtools/CertPanel                (Cert tab)
│   ├── devtools/TlsSummary           (protocol / cipher / verify_ok badges)
│   └── devtools/CertCard             (one parsed cert per PEM in cert_chain)
└── devtools/JwtPanel                 (JWT tab)
    ├── devtools/JwtSourcePicker       (which detected token: Authorization / body field / cookie)
    └── devtools/JwtClaimsView         (header + payload claims + live countdown + status)
        └── devtools/JwtCountdown       (live exp/nbf countdown — its own file for the interval)
```

New pure helpers (all `src/lib/*`, no React/Tauri, each with a colocated `.test.ts`):

| File | Exports | Responsibility |
|---|---|---|
| `src/lib/percentile.ts` | `percentile(sorted:number[], p:number):number`, `benchStats(samples:number[]):BenchStats` | Nearest-rank / linear-interp percentile + p50/p95/p99/min/max/avg/count. |
| `src/lib/histogram.ts` | `histogramBins(samples:number[], binCount?:number):HistogramBin[]` | Bucket samples into fixed-width bins for the SVG (pure, deterministic). |
| `src/lib/jwt.ts` | `decodeJwt(token:string):DecodedJwt`, `detectJwtCandidates(r:ResponseData):JwtCandidate[]`, `jwtExpiryStatus(payload, nowMs):ExpiryStatus` | base64url split/decode (no verify), source detection, expiry classification. |
| `src/lib/certParse.ts` | `parseCert(pem:string):ParsedCert`, `certFingerprintSha256(pem:string):Promise<string>` | best-effort PEM→DER→minimal ASN.1 field extraction + SHA-256 fingerprint (SubtleCrypto). |

New hooks (`src/hooks/*`):

| File | Exports | Responsibility |
|---|---|---|
| `src/hooks/useBenchmark.ts` | `useBenchmark(): UseBenchmark` | The benchmark loop state machine — sequential `resolveAndSend` × N, progress, cancel, stats. |
| `src/hooks/useJwtCountdown.ts` | `useJwtCountdown(payload): CountdownState` | 1 Hz ticking countdown to `exp`/`nbf` (`prefers-reduced-motion` → no pulse, value still updates). |

New UI store slice (extend `src/state/useUiStore.ts`): `devToolsOpen: boolean`, `openDevTools()`, `closeDevTools()`, `toggleDevTools()` — mirrors the existing `paletteOpen`/`envManagerOpen` pattern.

---

## 2. MINI-BENCHMARK

### 2.1 What it does

Re-runs **the current request** N times through the **exact same** `resolveAndSend()` path used by Send (so env flatten, secret fetch, interpolation and SigV4 all behave identically), collects `ResponseData.timings.total_ms` from each successful probe, and reports the latency distribution.

> **This really hits the endpoint N times.** It is guarded (§2.6): an explicit warning + confirm before the first request fires. Never auto-start.

### 2.2 Loop model — **sequential** (decision)

**Decision: sequential by default**, with an optional small bounded concurrency (`concurrency ∈ {1..4}`, default **1**) exposed in the launcher for advanced users.

Rationale for sequential-default:
- **Correctness of the measurement.** Concurrent requests share the machine's CPU, the WKWebView bridge, and often the same TCP/TLS connection pool in libcurl — parallel probes contend and inflate/deflate each other's `total_ms`, so the distribution stops reflecting real per-request latency. Sequential gives clean, comparable samples.
- **Don't overload the target.** A local dev endpoint (Lokówka's whole premise) is easy to knock over with a burst; sequential is polite by default.
- **Simplicity + cancellation.** A sequential `for`-loop with an `await` per iteration is trivially cancelable between iterations and needs no worker pool.

The concurrency knob exists for the case where the user *wants* load-ish behavior, but it is opt-in and capped at 4. When `concurrency > 1` the loop runs a fixed-size async pool; percentile math is unchanged (it's just over the collected samples).

**Cancellation:** a `canceledRef` flag checked before each iteration (and each pooled task before it starts). Cancel also fires `cancelRequest(currentRunId)` for the in-flight probe (reusing the engine's abort), then stops scheduling further probes. Partial results (samples collected so far) are kept and stats recomputed over them.

**Request identity:** each probe needs a distinct id so `cancel_request` targets the right one and history stays clean. The benchmark clones the draft per iteration with a fresh id: `{ ...draft, id: \`${draft.id}#bench-${i}\` }` (via `newId()` in `src/lib/ids.ts` — do not reuse the draft's persisted id, so a bench probe never collides with a real send or writes a real-request history row we don't want). History pollution: benchmark probes DO go through `resolve_and_send`, which writes history in Rust; to avoid flooding history we run with a per-probe synthetic id and treat those rows as benchmark noise — **document this as a known limitation**; a future `resolve_and_send` flag to skip history is out of scope (no Rust changes here).

### 2.3 `useBenchmark` (new — `src/hooks/useBenchmark.ts`)

```ts
export type BenchPhase = "idle" | "running" | "done" | "canceled" | "error";

export interface BenchConfig {
  iterations: number;   // default 20, clamp 1..500
  concurrency: number;  // default 1, clamp 1..4
}

export interface BenchSample {
  index: number;
  totalMs: number;
  status: number;        // response status (color outliers / non-2xx)
  ok: boolean;           // resolveAndSend resolved (not a network error)
  timings: Timings;      // full timings, so a clicked sample re-renders the waterfall
}

export interface BenchState {
  phase: BenchPhase;
  config: BenchConfig;
  completed: number;                 // x of N (progress)
  samples: BenchSample[];            // successful + failed, in completion order
  stats: BenchStats | null;          // from benchStats() over ok samples' totalMs
  error: string | null;              // fatal loop error (rare; per-probe errors captured per-sample)
  selectedIndex: number | null;      // which sample's waterfall is shown
}

export interface UseBenchmark {
  benchState: BenchState;
  run: (draft: StoredRequest, environmentId: string | null, config: BenchConfig) => Promise<void>;
  cancel: () => void;
  selectSample: (index: number | null) => void;
  reset: () => void;
}
```

- `run` sets `phase="running"`, loops `resolveAndSend(probeDraft, environmentId)` sequentially (or via the bounded pool), pushing a `BenchSample` per settled probe and bumping `completed`. On loop end → `phase="done"`, `stats = benchStats(okSamples)`.
- Only **ok** samples (resolved, any status) feed the latency stats; failed probes are still listed (flagged) so the user sees error rate. (A non-2xx status is still a valid latency sample — it's an outlier flag, not excluded.)
- `cancel` sets `canceledRef`, calls `cancelRequest(currentProbeId)`, sets `phase="canceled"`, recomputes stats over partials.
- `selectSample(i)` sets `selectedIndex` → `BenchmarkPanel` renders that sample's `TimelineWaterfall`.
- Reuses `resolveAndSend` from `src/lib/ipc.ts` (already wrapped) — **no new IPC.**

### 2.4 `percentile.ts` (pure, unit-tested)

```ts
export interface BenchStats {
  count: number;
  min: number; max: number; avg: number;
  p50: number; p95: number; p99: number;
}

/** Percentile of an ASCENDING-sorted array. Linear interpolation between
 *  ranks (type-7 / Excel PERCENTILE.INC), so p50 of [10,20] === 15. Empty → 0. */
export function percentile(sortedAsc: number[], p: number): number;

/** Copy → sort ascending → derive all stats in one pass. Empty → all zeros. */
export function benchStats(samples: number[]): BenchStats;
```

**Definition (pin it so the test is deterministic):** rank `r = (p/100) * (n - 1)`, interpolate between `floor(r)` and `ceil(r)`. `p50` of `[10,20,30]` = 20; `p50` of `[10,20]` = 15; `p95`/`p99` clamp to `max` for small n. Guards: empty → 0; single element → that element for every percentile; NaN/negatives excluded upstream (benchmark only feeds finite ms).

### 2.5 Visualization — pure SVG histogram (`LatencyHistogram.tsx` + `histogram.ts`)

- **`histogramBins(samples, binCount = 24)`** → `HistogramBin[] = { x0:number; x1:number; count:number }[]`. Fixed-width bins across `[min, max]`; `binCount` clamps for small n (`Math.min(binCount, samples.length)` with a floor of ~8). Deterministic, pure, unit-tested.
- **`LatencyHistogram.tsx`** — hand-rolled inline `<svg viewBox="0 0 W H">` (no chart lib):
  - Bars: one `<rect>` per bin, height ∝ `count`, filled with a low-key neutral (`--lok-ink-400`) so the **overlay lines are the stars**; the bin containing the *clicked* sample (or hovered) tints `--lok-brand-subtle`.
  - **Overlay lines** for **p50 / p95 / p99** as vertical `<line>`s at the x-position of each percentile value, colored by the design system: p50 `--lok-phase-connect` (blue, "typical"), p95 `--lok-status-warn` (amber, "tail"), p99 `--lok-status-danger` (red, "worst"). Each line has an SVG `<text>` label ("p95 128 ms", `.lok-tnums`).
  - **Axes:** x-axis ticks in ms (min…max), y-axis a count scale; tick labels are real `<text>` with `font-variant-numeric: tabular-nums`. Axis lines use `--lok-border-default`.
  - **Click-through:** clicking a bar (or a sample marker) calls `onSelectSample(index)` → the panel shows that sample's `TimelineWaterfall` (reuse of `response/TimelineWaterfall.tsx` — **no new waterfall code**). Bars are `role="button"` with an `aria-label` ("Próba 7 · 132 ms · 200") for keyboard/AT.
  - **Motion:** bars grow from baseline on mount (`--lok-dur-slower`, `--lok-ease-decelerate`) via a CSS transform on the group; `prefers-reduced-motion` collapses it (base.css gate). No JS motion.
  - **Tokens only:** all fills/strokes are `var(--lok-*)`; SVG text uses `var(--lok-font-mono)` and `currentColor`/token fills.

### 2.6 Progress, cancel, and the "this hits your endpoint" guard

- **`BenchmarkProgress`** — shows `completed / iterations` (tabular-nums) with a heat progress meter (`--lok-gradient-heat-x`, honoring reduced-motion) and a **Cancel** button while `phase === "running"`.
- **The warning gate (mandatory):** the "Benchmark" button does **not** start immediately. First click opens `BenchmarkLauncher` (in the drawer or an inline popover) with:
  - Config: `iterations` (default 20), `concurrency` (default 1),
  - A prominent warning line: **"Benchmark wykona {N} realnych requestów na {host}."** using `--lok-status-warn` + `i-alert` (icon + text, never color-only),
  - An explicit **"Uruchom benchmark"** button that is the *only* thing that starts the loop.
  - If the request URL is empty, or has redacted secrets (`hasRedactedSecrets(draft)` from `src/lib/replay.ts`), or is a `prod`-accent env (read `useEnvStore.activeKind()`), the warning escalates (stronger copy, still explicit-start) — **never silently block**, but make the prod case loud.

---

## 3. JWT DECODER

### 3.1 What it does

Finds JWTs already present in the response (or accepts a pasted token), decodes header + payload **without verifying the signature**, and shows claims with a **live countdown** to `exp` and status color. It is a *decoder*, not a validator — the UI states this explicitly.

> **SECURITY (hard rule):** the token is **never** logged, persisted, sent over IPC, or written to any store/history/Keychain. All decoding is pure in-browser JS (`src/lib/jwt.ts`). The pasted-token textarea has `autoComplete="off"`, `spellCheck={false}`, and its value lives only in local component state.

### 3.2 Detection — `detectJwtCandidates(response)` (`src/lib/jwt.ts`)

Scans, in priority order, and returns a de-duplicated list of `JwtCandidate = { source: JwtSource; token: string; label: string }`:

1. **`Authorization` request/response header** — this tool reads `response.headers` (response side) for `Authorization: Bearer eyJ...`; also any header whose value matches the JWT shape. `label = "Authorization header"`.
2. **`Set-Cookie` headers** — cookies whose value is a JWT (`name=eyJ...`). `label = "Cookie {name}"`.
3. **Response body JSON fields** — parse `response.body` (when JSON content-type + not base64/truncated) and pick string fields whose **key matches `/token|jwt|access|id_token|refresh/i`** *and* whose value matches the JWT regex. `label = "body.{path}"`.
4. **Any `eyJ...` substring** in headers/body as a last-resort scan (regex `\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b`).

**JWT shape check:** exactly three `.`-separated base64url segments (third may be empty for `alg:none`), header decodes to JSON with a `typ`/`alg`-ish object. Never throw during detection — a non-JWT match is simply dropped.

### 3.3 Decode — `decodeJwt(token)` (pure, no verify)

```ts
export interface DecodedJwt {
  raw: string;
  header: Record<string, unknown> | null;   // decoded JOSE header
  payload: Record<string, unknown> | null;  // decoded claims
  signature: string;                         // raw base64url 3rd segment (NOT verified)
  valid: boolean;                            // structurally decodable (NOT signature-valid)
  error: string | null;                      // "not a JWT", "bad base64url", "bad JSON"
}

export function decodeJwt(token: string): DecodedJwt;
```

- Split on `.` → require 3 segments. **base64url-decode** header + payload (`-`→`+`, `_`→`/`, pad to length %4, then `atob` → UTF-8 via `TextDecoder`/`decodeURIComponent(escape())`), `JSON.parse` each.
- **Signature is captured verbatim but NEVER verified** — no crypto, no key. `DecodedJwt.valid` means "decoded structurally," and `JwtClaimsView` renders a persistent, unmissable banner: **"Podpis niezweryfikowany — to tylko dekoder."** (`--lok-status-neutral` + `i-unlock`, icon + text).
- Errors are returned, not thrown (bad base64 / bad JSON → `error` set, partial fields where possible).

### 3.4 Claims + expiry status — `jwtExpiryStatus(payload, nowMs)`

Standard registered claims surfaced first (each with a human tooltip): `iss`, `sub`, `aud`, `iat`, `nbf`, `exp`, `jti`. Time claims are epoch **seconds** — convert to ms for display (absolute local time + relative). All other claims render below in a scrollable KV list (`.kv`-style, read-only, `.lok-selectable`).

```ts
export type ExpiryStatus = "valid" | "expiring-soon" | "expired" | "not-yet-valid" | "no-exp";

/** expiring-soon threshold = 5 minutes (300_000 ms) before exp. */
export function jwtExpiryStatus(
  payload: Record<string, unknown> | null,
  nowMs: number,
): { status: ExpiryStatus; expMs: number | null; nbfMs: number | null; deltaMs: number | null };
```

Status → color (token) + icon + label (never color-only):

| Status | Token | Icon | Label |
|---|---|---|---|
| `valid` | `--lok-status-success` | `i-check` | "Ważny" + "wygasa za {rel}" |
| `expiring-soon` (< 5 min to exp) | `--lok-status-warn` | `i-alert` | "Wygasa wkrótce" + "za {rel}" |
| `expired` | `--lok-status-danger` | `i-x` | "Wygasł" + "{rel} temu" |
| `not-yet-valid` (nbf in future) | `--lok-status-info` | `i-clock` | "Jeszcze nieważny" + "od {rel}" |
| `no-exp` | `--lok-status-neutral` | `i-unlock` | "Brak exp" |

### 3.5 Live countdown — `useJwtCountdown(payload)` + `JwtCountdown.tsx`

- **`useJwtCountdown`** ticks at **1 Hz** (`setInterval` 1000 ms, cleared on unmount / when payload changes) and returns `{ status, label, deltaMs }` recomputed each tick via `jwtExpiryStatus(payload, Date.now())`. Uses a single shared clock ref (like `HistoryDrawer`'s `now` clock) so multiple time labels stay in sync.
- **`JwtCountdown.tsx`** renders the live `mm:ss` (or `Xd Yh` for far-off) with `.lok-tnums`. As it crosses the `expiring-soon` threshold the color flips warn→danger. A subtle pulse on the countdown is CSS-only and **gated by `prefers-reduced-motion`** (reduced → number still updates, no pulse).
- Formatting helper `formatRelativeDuration(ms)` → "za 4 min 12 s" / "3 dni temu" lives in `src/lib/format.ts` (extend it; keep it pure + tested) — reuse the existing `relativeTime.ts` if its shape already fits.

### 3.6 `JwtPanel` / `JwtPasteDecoder`

- **`JwtPasteDecoder`** (drawer) — a labelled `<textarea aria-label="Wklej token JWT">` → `decodeJwt` on change (debounced) → `JwtClaimsView`. Clear button. **No** persistence.
- **`JwtSourcePicker`** (dock `JWT` tab) — a small select of detected candidates (`Authorization header`, `Cookie sid`, `body.data.accessToken`, …) → selected candidate feeds `JwtClaimsView`.
- **`JwtClaimsView`** — the always-visible "podpis niezweryfikowany" banner, the status badge (from §3.4), the registered-claims block, the raw claims KV list, and `JwtCountdown`. A **copy-header / copy-payload** button copies the *decoded JSON* (not the token) — with an explicit note that copying the token is intentionally not offered.

---

## 4. TLS CERT VIEWER

### 4.1 What it does

From `response.tls: TlsInfo | null` (only when present), shows the negotiated **protocol** + **cipher** + **verify_ok**, and — when `cert_chain: string[]` (PEM) is non-empty — a card per certificate with the fields we can extract.

### 4.2 `TlsSummary.tsx`

Three badges (each icon + text, never color-only):
- **Protocol** — `tls.protocol` (e.g. "TLSv1.3"), neutral chip, mono, `.lok-tnums` for the version number.
- **Cipher** — `tls.cipher` (e.g. "TLS_AES_128_GCM_SHA256"), neutral chip, mono, truncate + title tooltip.
- **Verify** — `tls.verify_ok` → `--lok-status-success` + `i-lock` + "Zweryfikowany" | `--lok-status-danger` + `i-unlock` + "Niezweryfikowany". If `response` used `options.insecure`, add a loud "verification skipped (--insecure)" note.

### 4.3 Cert parsing — **decision: best-effort minimal ASN.1, hard fallback to raw PEM + SHA-256**

> **Decision:** implement a **small, self-contained pure-JS PEM→DER→minimal-ASN.1 walker** that extracts only the handful of fields users care about; **no heavy libraries** (no `node-forge`, no `pkijs`/`asn1js`, no `jsrsasign` — they'd bloat the bundle and pull Node polyfills into the WKWebView). If parsing of any field fails or the structure is unexpected, **degrade gracefully to raw PEM + a SHA-256 fingerprint + whatever fields we did get** — never crash, never show a blank card.

**`certFingerprintSha256(pem)`** — always available, independent of ASN.1: strip PEM armor → base64-decode to DER bytes → `crypto.subtle.digest("SHA-256", der)` → hex `AA:BB:...` (uppercase, colon-separated, `.lok-tnums`). `SubtleCrypto` is available in the WKWebView (secure context). This is the guaranteed-correct baseline the fallback leans on.

**`parseCert(pem)`** — `ParsedCert`:
```ts
export interface ParsedCert {
  subjectCn: string | null;      // CN from subject RDN
  issuerCn: string | null;       // CN from issuer RDN
  notBefore: string | null;      // ISO from ASN.1 UTCTime/GeneralizedTime
  notAfter: string | null;       // ISO
  sans: string[];                // dNSName entries from SubjectAltName ext (best-effort)
  serialHex: string | null;
  fingerprintSha256: string;     // ALWAYS set (from certFingerprintSha256)
  raw: string;                   // the PEM, for the "show raw" toggle
  parseComplete: boolean;        // false → some/all ASN.1 fields fell back
}
```

**Minimal ASN.1 walk (scope-limited on purpose):**
- Parse DER TLV (tag/length/value) just deep enough to reach `TBSCertificate`.
- **notBefore/notAfter** — the `Validity` SEQUENCE holds two time values; UTCTime (`YY...Z`, pivot year 2049) and GeneralizedTime (`YYYY...Z`). Convert to ISO. These are the highest-value, lowest-risk fields — implement first.
- **subject/issuer CN** — walk the Name RDNSequence, find the AttributeTypeAndValue whose OID is `2.5.4.3` (commonName), read its string. Distinguish subject vs issuer by position (issuer precedes validity precedes subject in TBS order).
- **serialNumber** — the INTEGER right after the (optional) version `[0]` in TBS → hex.
- **SANs (nice-to-have, guarded):** locate the `subjectAltName` extension (OID `2.5.29.17`), read `dNSName [2]` entries. If the extension parse is at all uncertain, skip SANs and set `parseComplete=false` — do **not** guess.

**Failure policy:** every field getter is wrapped so a parse miss returns `null` (not a throw) and sets `parseComplete=false`; the card still renders name/dates it *did* get, plus the always-present fingerprint, plus a **"Pokaż surowy PEM"** toggle. `certParse.test.ts` covers a known good PEM (all fields) **and** a deliberately-truncated/garbage PEM (fingerprint-only fallback, no crash, `parseComplete=false`).

### 4.4 `CertCard.tsx`

Per cert in `cert_chain` (leaf first): CN (subject), issuer CN, **validity** as `notBefore → notAfter` plus a computed **"ważny jeszcze X dni"** / **"wygasł X dni temu"** using the same relative-time helper (tabular-nums; danger when past `notAfter`, warn when < 30 days left), SANs as chips, serial + SHA-256 fingerprint (mono, `.lok-tnums`, copy button), and a "show raw PEM" disclosure. When `parseComplete === false`, a small neutral note: **"Częściowo sparsowany — pokazuję fingerprint i surowy PEM."**

---

## 5. Cross-cutting rules (applied to every component)

- **Shell:** `BenchmarkPanel` / `CertPanel` / `JwtPanel` live inside `.resp-body.lok-scroll` (already `min-height:0 + overflow:auto`); the `DevToolsDrawer` follows `HistoryDrawer` (fixed chrome, only the inner list scrolls). Nothing grows the window; `100dvh` stays owned by `AppShell`.
- **A11y:** every icon-only button (`Benchmark`, Cancel, copy, source-picker, raw-PEM toggle, drawer close) has an `aria-label`. Histogram bars are `role="button"` with descriptive names. Benchmark/JWT/TLS status are **never color-only** (hue + `i-*` icon + text). Tabs extend the existing `role="tablist"`/`aria-selected` semantics. Live regions: benchmark progress and JWT countdown use `aria-live="polite"`; the "podpis niezweryfikowany" banner is always-visible text.
- **Reduced motion:** histogram bar-grow, benchmark heat meter, and JWT countdown pulse are **CSS-only** → the `base.css` hard gate collapses them to `0.01ms`; the numbers still update. No JS-driven motion that bypasses the gate.
- **Tabular numbers:** p50/p95/p99/min/max/avg, per-run ms, histogram axis ticks + line labels, `completed/N`, JWT countdown, cert validity days, fingerprint hex — all `.lok-tnums`.
- **Tokens only:** every color is `var(--lok-*)`; histogram fills/strokes and cert/JWT status hues map to `--lok-status-*` / `--lok-phase-*` / `--lok-ink-*`. No raw hex.
- **Icons:** reuse the `<Icon>` sprite; add `i-bar-chart`, `i-key`, `i-clock`, `i-alert` as new symbols in `IconSprite.tsx` (exact Lucide paths, stroke 1.5). No CDN, no emoji-as-icon.
- **File size / structure:** views < ~100 lines; all looping/parsing/formatting in `src/lib/*` pure fns and `src/hooks/*`. Types at module scope.
- **No Rust / IPC changes:** the entire feature reads existing `ResponseData` and re-uses `resolveAndSend`/`cancelRequest`. If a future "skip history for benchmark" flag is wanted, that's a separate `models.rs`/`resolve.rs` PR (explicitly out of scope).

---

## 6. Test plan (Vitest + React Testing Library)

Mock the Tauri boundary: `vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`. `SubtleCrypto` is available under jsdom/node (`globalThis.crypto.subtle`); if a runner lacks it, the fingerprint test uses `node:crypto` `webcrypto`.

### 6.1 Pure-helper unit tests (fast, no DOM)

- **`percentile.test.ts`** — **known-values** table: `percentile([10,20,30,40,50], 50) === 30`; `percentile([10,20], 50) === 15`; `p95`/`p99` of small arrays clamp to `max`; `benchStats([100])` → all-100 stats; empty → all zeros; a 100-element ramp `[1..100]` → `p50≈50.5`, `p95≈95.05`, `p99≈99.01`, `min=1`, `max=100`, `avg=50.5`. Pins the interpolation definition (§2.4).
- **`histogram.test.ts`** — bins cover `[min,max]`, counts sum to `samples.length`, `binCount` clamps for tiny n, identical samples → one non-empty bin, empty → `[]` (no NaN).
- **`jwt.test.ts`** —
  - **decode a known token** (a fixed, hand-crafted JWT with `{ "alg":"HS256" }` header and `{ "sub":"123","exp":<fixed> }` payload) → `header.alg==="HS256"`, `payload.sub==="123"`, `valid===true`, signature captured, **no verification attempted**.
  - malformed inputs: 2-segment string → `valid===false`, `error` set, no throw; bad base64 → `error` set; `alg:none` (empty 3rd segment) → decodes, `valid===true`.
  - **`detectJwtCandidates`** — `ResponseData` with `Authorization: Bearer eyJ...` header, a `Set-Cookie: sid=eyJ...`, and a body `{"accessToken":"eyJ..."}` → 3 candidates with correct `source`/`label`; a response with no tokens → `[]`.
- **`jwt` expiry status** — `jwtExpiryStatus({exp: nowSec+3600}, now)` → `"valid"`; `{exp: nowSec+120}` → `"expiring-soon"`; `{exp: nowSec-10}` → `"expired"`; `{nbf: nowSec+100}` → `"not-yet-valid"`; `{}` → `"no-exp"`. Deltas correct in ms.
- **`certParse.test.ts`** — a **known real leaf PEM** fixture → `subjectCn`/`issuerCn`/`notBefore`/`notAfter` correct (ISO), `fingerprintSha256` matches a precomputed value (or matches `openssl x509 -fingerprint -sha256`), SANs contain expected dNSName, `parseComplete===true`. A **garbage/truncated PEM** → does not throw, `parseComplete===false`, `fingerprintSha256` still set (fallback), name/date fields `null`.

### 6.2 Hook tests

- **`useBenchmark` loop calls `resolveAndSend` N times and computes percentiles (mocked):** mock `resolveAndSend` to resolve a `ResponseData` with a scripted `timings.total_ms` sequence (e.g. `[100,110,90,...]` length 20); `run(draft, envId, {iterations:20, concurrency:1})` → `invoke`/`resolveAndSend` called exactly **20** times with `request.id` distinct per probe and `environmentId` = passed value; `benchState.phase` transitions `idle→running→done`; `benchState.stats.count===20` and `p50/p95/p99/min/max/avg` equal `benchStats` over the scripted samples. A failing probe (reject) is recorded as `ok:false` and excluded from stats but counted in `completed`.
- **benchmark cancel:** while running (a never-resolving `resolveAndSend`), `cancel()` → `phase==="canceled"`, `cancelRequest` invoked with the current probe id, no further `resolveAndSend` calls after cancel, stats over partials.
- **`useJwtCountdown`:** with a payload `exp = now + 65s`, advance fake timers 1 s → label ticks down; crossing the 5-min / expiry thresholds flips `status`; unmount clears the interval (no leaked timer). `prefers-reduced-motion` mock → still updates value.

### 6.3 Component render tests (RTL)

- **`LatencyHistogram`** — given stats + samples, renders N `<rect>` bars, three overlay lines with labels `p50`/`p95`/`p99` at the right x-positions, axis ticks are tabular-nums, clicking a bar calls `onSelectSample(index)` and the panel then renders `TimelineWaterfall` for that sample. Bars expose accessible names.
- **`BenchmarkProgress`** — shows `7 / 20` (tabular-nums) and a Cancel button while running; the "wykona N realnych requestów" warning renders (icon + text) in the launcher before start.
- **`JwtClaimsView`** — always renders the "podpis niezweryfikowany" banner; a valid token → success badge + "Ważny"; an expired token → danger badge + "Wygasł"; copy button copies decoded JSON, **not** the raw token; **assert `console.log`/`console.error` were never called with the token and no `invoke` fires** (secret-leak guard).
- **`TlsSummary` / `CertCard`** — `verify_ok:true` → `i-lock` + "Zweryfikowany"; a parseable PEM → CN/issuer/validity/fingerprint shown; a fallback PEM → fingerprint + "surowy PEM" note, no crash.
- **A11y smoke:** icon-only buttons expose accessible names (`getByRole("button", { name })`); new dock tabs expose `role="tab"` + `aria-selected`; benchmark progress + countdown regions are `aria-live="polite"`.

---

## 7. Execution order for the coding agent

1. **Pure helpers + tests** (no UI risk, fast feedback): `percentile.ts`, `histogram.ts`, `jwt.ts`, `certParse.ts` + colocated `.test.ts` (known-value fixtures for percentile, a fixed JWT, a real + garbage PEM).
2. **Icons:** add `i-bar-chart`, `i-key`, `i-clock`, `i-alert` to `IconSprite.tsx`.
3. **Hooks + tests:** `useBenchmark.ts` (loop over `resolveAndSend`, cancel, stats), `useJwtCountdown.ts`. Extend `useUiStore` with the `devTools*` slice.
4. **ResponseTabs extension:** conditional `Bench`/`Cert`/`JWT` tabs + new props; wire into `ResponseDock` (pass `benchState`, `response.tls`, jwt candidates from the parent workbench).
5. **Benchmark UI:** `BenchmarkButton` (into `RequestBar`), `BenchmarkLauncher` (warning gate), `BenchmarkProgress`, `BenchmarkStats`, `LatencyHistogram` (pure SVG), `BenchmarkPanel` (reusing `TimelineWaterfall` for the selected sample).
6. **JWT UI:** `JwtPanel`, `JwtSourcePicker`, `JwtClaimsView`, `JwtCountdown`, `JwtPasteDecoder`.
7. **TLS UI:** `CertPanel`, `TlsSummary`, `CertCard`.
8. **DevToolsDrawer** + titlebar/palette entry point; wire benchmark state up from `RequestWorkbench` so the button, launcher, panel and drawer share one `useBenchmark`.
9. `yarn typecheck` + `yarn test:unit` green; visual/a11y pass (both themes); confirm **no scrollable window**, **no token ever logged/persisted/sent**, benchmark warning gate present, histogram proportional with p50/p95/p99 lines, cert fallback never crashes.

**Definition of done:** typecheck clean, unit tests green (percentile known-values, JWT known-token + expiry status, cert parse + fallback, benchmark loop calls `resolveAndSend` N times and computes percentiles over mocks), benchmark hits the real endpoint only after an explicit warned start and is cancelable, JWT decode never verifies/logs/sends the token and shows a live countdown + "podpis niezweryfikowany", TLS viewer parses the common fields with a fingerprint+raw-PEM fallback, reduced-motion + a11y + tabular-nums + tokens-only satisfied, no Rust/IPC changes.
