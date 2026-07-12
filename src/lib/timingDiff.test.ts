import { describe, expect, it } from "vitest";
import { timingDiff } from "./timingDiff";
import type { Timings } from "./types";

const timings = (
  dns: number,
  connect: number,
  tls: number,
  ttfb: number,
  total: number,
): Timings => ({
  dns_ms: dns,
  connect_ms: connect,
  tls_ms: tls,
  ttfb_ms: ttfb,
  total_ms: total,
});

describe("timingDiff", () => {
  it("computes per-phase deltas from cumulative timings plus a total row", () => {
    // cumulative → per-phase durations: dns 10, connect 10, tls 10, ttfb 20, download 50
    const before = timings(10, 20, 30, 50, 100);
    // dns 10, connect 10, tls 10, ttfb 10, download 40
    const after = timings(10, 20, 30, 40, 80);
    const rows = timingDiff(before, after);

    const byPhase = Object.fromEntries(rows.map((r) => [r.phase, r]));
    expect(byPhase.ttfb.beforeMs).toBe(20);
    expect(byPhase.ttfb.afterMs).toBe(10);
    expect(byPhase.ttfb.deltaMs).toBe(-10);
    expect(byPhase.total.beforeMs).toBe(100);
    expect(byPhase.total.afterMs).toBe(80);
  });

  it("marks a slower B with a positive delta and faster:false", () => {
    const rows = timingDiff(timings(0, 0, 0, 0, 100), timings(0, 0, 0, 0, 150));
    const total = rows.find((r) => r.phase === "total")!;
    expect(total.deltaMs).toBe(50);
    expect(total.faster).toBe(false);
  });

  it("marks a faster B with faster:true", () => {
    const rows = timingDiff(timings(0, 0, 0, 0, 100), timings(0, 0, 0, 0, 60));
    const total = rows.find((r) => r.phase === "total")!;
    expect(total.deltaMs).toBe(-40);
    expect(total.faster).toBe(true);
  });

  it("computes pctChange and guards divide-by-zero (before === 0 → null)", () => {
    const rows = timingDiff(timings(0, 0, 0, 0, 100), timings(0, 0, 0, 0, 120));
    const total = rows.find((r) => r.phase === "total")!;
    expect(total.pctChange).toBeCloseTo(20);
    // dns before is 0 → pctChange must be null (no Infinity/NaN)
    const dns = rows.find((r) => r.phase === "dns")!;
    expect(dns.beforeMs).toBe(0);
    expect(dns.pctChange).toBeNull();
  });
});
