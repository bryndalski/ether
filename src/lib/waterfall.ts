// Convert libcurl's cumulative timings into per-phase spans and percentages for
// the response waterfall. libcurl timings are cumulative from the start of the
// transfer (dns_ms ≤ connect_ms ≤ tls_ms ≤ ttfb_ms ≤ total_ms); the waterfall
// wants each phase's own duration plus where it sits on the 0–100% track.

import type { Timings } from "./types";

export type PhaseName = "dns" | "connect" | "tls" | "ttfb" | "download";

export interface PhaseSpan {
  phase: PhaseName;
  label: string;
  /** Duration of this phase alone, in ms (already clamped to ≥ 0). */
  durationMs: number;
  /** Where the bar starts, as a percentage of total_ms. */
  leftPct: number;
  /** Bar length, as a percentage of total_ms. */
  widthPct: number;
  /** The design-system phase color token. */
  colorToken: string;
}

const PHASE_META: Record<PhaseName, { label: string; colorToken: string }> = {
  dns: { label: "DNS", colorToken: "var(--lok-phase-dns)" },
  connect: { label: "Connect", colorToken: "var(--lok-phase-connect)" },
  tls: { label: "TLS", colorToken: "var(--lok-phase-tls)" },
  ttfb: { label: "TTFB", colorToken: "var(--lok-phase-ttfb)" },
  download: { label: "Download", colorToken: "var(--lok-phase-download)" },
};

const PHASE_ORDER: PhaseName[] = ["dns", "connect", "tls", "ttfb", "download"];

/** Clamp out-of-order / negative cumulative timings to a monotonic sequence. */
function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Derive the five phase spans from cumulative timings. Guards total_ms ≤ 0
 * (renders zero-width bars, never NaN/Infinity) and clamps negatives.
 */
export function phaseSpans(timings: Timings): PhaseSpan[] {
  const total = clampNonNegative(timings.total_ms);
  const dnsEnd = clampNonNegative(timings.dns_ms);
  const connectEnd = clampNonNegative(timings.connect_ms);
  const tlsEnd = clampNonNegative(timings.tls_ms);
  const ttfbEnd = clampNonNegative(timings.ttfb_ms);

  const durations: Record<PhaseName, number> = {
    dns: dnsEnd,
    connect: Math.max(0, connectEnd - dnsEnd),
    tls: Math.max(0, tlsEnd - connectEnd),
    ttfb: Math.max(0, ttfbEnd - tlsEnd),
    download: Math.max(0, total - ttfbEnd),
  };

  const spans: PhaseSpan[] = [];
  let cumulativeStart = 0;
  for (const phase of PHASE_ORDER) {
    const durationMs = durations[phase];
    const leftPct = total > 0 ? (cumulativeStart / total) * 100 : 0;
    const widthPct = total > 0 ? (durationMs / total) * 100 : 0;
    spans.push({
      phase,
      label: PHASE_META[phase].label,
      durationMs,
      leftPct,
      widthPct,
      colorToken: PHASE_META[phase].colorToken,
    });
    cumulativeStart += durationMs;
  }
  return spans;
}
