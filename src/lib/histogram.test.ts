import { describe, expect, it } from "vitest";
import { histogramBins } from "./histogram";

describe("histogramBins", () => {
  it("returns [] for empty input (no NaN)", () => {
    expect(histogramBins([])).toEqual([]);
  });

  it("bins cover [min,max] and counts sum to sample count", () => {
    const samples = [10, 12, 15, 20, 22, 30, 31, 35, 40, 50];
    const bins = histogramBins(samples, 5);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(samples.length);
    expect(bins[0].x0).toBe(10);
    expect(bins[bins.length - 1].x1).toBeCloseTo(50, 5);
  });

  it("clamps bin count for tiny n (never more bins than samples)", () => {
    const bins = histogramBins([5, 9, 30], 24);
    expect(bins.length).toBeLessThanOrEqual(3);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
  });

  it("collapses identical samples into a single non-empty bin", () => {
    const bins = histogramBins([7, 7, 7, 7], 24);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(4);
    expect(bins[0].x0).toBe(7);
    expect(bins[0].x1).toBe(7);
  });

  it("places the maximum sample in the last (inclusive) bin", () => {
    const bins = histogramBins([0, 50, 100], 10);
    const total = bins.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(3);
    expect(bins[bins.length - 1].count).toBeGreaterThanOrEqual(1);
  });

  it("ignores non-finite samples", () => {
    const bins = histogramBins([10, Number.NaN, 20, Infinity, 30], 3);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
  });
});
