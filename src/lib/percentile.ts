// Pure latency statistics for the mini-benchmark. No React, no Tauri.
// Percentile uses type-7 / Excel PERCENTILE.INC linear interpolation between
// ranks, so p50 of [10,20] === 15 — pinned here so the unit test is deterministic.

export interface BenchStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Percentile of an ASCENDING-sorted array with linear interpolation between
 * ranks (rank r = (p/100) * (n - 1), interpolate floor(r)..ceil(r)).
 * Empty → 0; single element → that element for every p.
 */
export function percentile(sortedAsc: number[], p: number): number {
  const count = sortedAsc.length;
  if (count === 0) return 0;
  if (count === 1) return sortedAsc[0];
  const clampedP = Math.min(100, Math.max(0, p));
  const rank = (clampedP / 100) * (count - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sortedAsc[lowerIndex];
  const fraction = rank - lowerIndex;
  return (
    sortedAsc[lowerIndex] +
    (sortedAsc[upperIndex] - sortedAsc[lowerIndex]) * fraction
  );
}

/** Copy → sort ascending → derive all stats in one pass. Empty → all zeros.
 *  Only finite values feed the stats (the benchmark only supplies finite ms). */
export function benchStats(samples: number[]): BenchStats {
  const finite = samples.filter((value) => Number.isFinite(value));
  const count = finite.length;
  if (count === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sortedAsc = [...finite].sort((a, b) => a - b);
  const sum = sortedAsc.reduce((acc, value) => acc + value, 0);
  return {
    count,
    min: sortedAsc[0],
    max: sortedAsc[count - 1],
    avg: sum / count,
    p50: percentile(sortedAsc, 50),
    p95: percentile(sortedAsc, 95),
    p99: percentile(sortedAsc, 99),
  };
}
