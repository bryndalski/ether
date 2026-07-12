import { describe, expect, it } from "vitest";
import { benchStats, percentile } from "./percentile";

describe("percentile (type-7 linear interpolation)", () => {
  it("matches known values on a 5-element array", () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
  });

  it("interpolates between ranks (p50 of [10,20] === 15)", () => {
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("clamps p95/p99 toward max for small n", () => {
    expect(percentile([10, 20], 95)).toBeCloseTo(19.5, 5);
    expect(percentile([10, 20], 99)).toBeCloseTo(19.9, 5);
  });

  it("returns the element for a single-element array at every p", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it("returns 0 for an empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe("benchStats", () => {
  it("computes a 1..100 ramp to the pinned percentile definition", () => {
    const ramp = Array.from({ length: 100 }, (_, index) => index + 1);
    const stats = benchStats(ramp);
    expect(stats.count).toBe(100);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
    expect(stats.avg).toBe(50.5);
    expect(stats.p50).toBeCloseTo(50.5, 5);
    expect(stats.p95).toBeCloseTo(95.05, 5);
    expect(stats.p99).toBeCloseTo(99.01, 5);
  });

  it("collapses a single sample to all-equal stats", () => {
    const stats = benchStats([100]);
    expect(stats).toEqual({
      count: 1,
      min: 100,
      max: 100,
      avg: 100,
      p50: 100,
      p95: 100,
      p99: 100,
    });
  });

  it("returns all zeros for empty input", () => {
    expect(benchStats([])).toEqual({
      count: 0,
      min: 0,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    });
  });

  it("ignores non-finite samples", () => {
    const stats = benchStats([10, Number.NaN, 20, Infinity, 30]);
    expect(stats.count).toBe(3);
    expect(stats.avg).toBe(20);
  });
});
