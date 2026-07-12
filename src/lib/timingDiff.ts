// Per-phase timing diff for Response Diff. Reuses waterfall.ts::phaseSpans to
// turn each side's cumulative Timings into per-phase durations, then diffs phase
// by phase plus a `total` row. Pure and unit-tested (docs/architecture/history-diff.md §5.3).

import type { Timings } from "./types";
import { phaseSpans, type PhaseName } from "./waterfall";

export type DiffPhase = PhaseName | "total";

export interface PhaseDelta {
  phase: DiffPhase;
  beforeMs: number;
  afterMs: number;
  /** after - before; positive means B is slower. */
  deltaMs: number;
  faster: boolean; // deltaMs < 0
  /** (after-before)/before*100, or null when before is 0 (no divide-by-zero). */
  pctChange: number | null;
}

function phaseDurations(timings: Timings): Record<PhaseName, number> {
  const durations = {} as Record<PhaseName, number>;
  for (const span of phaseSpans(timings)) {
    durations[span.phase] = span.durationMs;
  }
  return durations;
}

function delta(beforeMs: number, afterMs: number, phase: DiffPhase): PhaseDelta {
  const deltaMs = afterMs - beforeMs;
  return {
    phase,
    beforeMs,
    afterMs,
    deltaMs,
    faster: deltaMs < 0,
    pctChange: beforeMs === 0 ? null : (deltaMs / beforeMs) * 100,
  };
}

const PHASE_ORDER: PhaseName[] = ["dns", "connect", "tls", "ttfb", "download"];

/** Per-phase + total deltas between two responses' cumulative timings. */
export function timingDiff(before: Timings, after: Timings): PhaseDelta[] {
  const b = phaseDurations(before);
  const a = phaseDurations(after);
  const rows: PhaseDelta[] = PHASE_ORDER.map((phase) =>
    delta(b[phase], a[phase], phase),
  );
  rows.push(delta(before.total_ms, after.total_ms, "total"));
  return rows;
}
