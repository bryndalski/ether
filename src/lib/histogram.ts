// Pure, deterministic bucketing of latency samples into fixed-width bins for the
// SVG histogram. No React, no Tauri.

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

const MIN_BINS = 8;

/**
 * Bucket samples into fixed-width bins across [min, max]. `binCount` clamps for
 * small n (never more bins than samples, floor of ~8 when there is enough data).
 * Identical samples collapse to a single non-empty bin. Empty → [].
 */
export function histogramBins(
  samples: number[],
  binCount = 24,
): HistogramBin[] {
  const finite = samples.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [];

  const min = Math.min(...finite);
  const max = Math.max(...finite);

  // Degenerate range (all-equal samples) → one bin holding everything.
  if (max === min) {
    return [{ x0: min, x1: min, count: finite.length }];
  }

  // Clamp bin count: honor the request, but for small n keep at least MIN_BINS
  // worth of resolution only when there are enough samples to fill them, and
  // never emit more bins than samples.
  const requestedBins = Math.max(1, Math.floor(binCount));
  const usedBins = Math.max(
    1,
    Math.min(requestedBins, Math.max(MIN_BINS, finite.length), finite.length),
  );
  const width = (max - min) / usedBins;

  const result: HistogramBin[] = Array.from({ length: usedBins }, (_, index) => ({
    x0: min + index * width,
    x1: min + (index + 1) * width,
    count: 0,
  }));

  for (const value of finite) {
    // Last bin is inclusive of max so the maximum sample lands in-range.
    let index = Math.floor((value - min) / width);
    if (index >= usedBins) index = usedBins - 1;
    if (index < 0) index = 0;
    result[index].count += 1;
  }

  return result;
}
