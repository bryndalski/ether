import { describe, expect, it } from "vitest";
import { phaseSpans } from "./waterfall";
import type { Timings } from "./types";

const sample: Timings = {
  dns_ms: 11,
  connect_ms: 30,
  tls_ms: 57,
  ttfb_ms: 126,
  total_ms: 148,
};

describe("phaseSpans", () => {
  it("derives per-phase durations from cumulative timings", () => {
    const spans = phaseSpans(sample);
    const byPhase = Object.fromEntries(spans.map((s) => [s.phase, s.durationMs]));
    expect(byPhase.dns).toBe(11);
    expect(byPhase.connect).toBe(19); // 30 - 11
    expect(byPhase.tls).toBe(27); // 57 - 30
    expect(byPhase.ttfb).toBe(69); // 126 - 57
    expect(byPhase.download).toBe(22); // 148 - 126
  });

  it("produces widths that sum to ~100%", () => {
    const spans = phaseSpans(sample);
    const totalWidth = spans.reduce((acc, s) => acc + s.widthPct, 0);
    expect(totalWidth).toBeCloseTo(100, 5);
  });

  it("chains left offsets to the previous cumulative width", () => {
    const spans = phaseSpans(sample);
    expect(spans[0].leftPct).toBeCloseTo(0, 5);
    // second bar starts where the first ends
    expect(spans[1].leftPct).toBeCloseTo(spans[0].widthPct, 5);
  });

  it("returns zero widths (no NaN/Infinity) when total_ms is 0", () => {
    const spans = phaseSpans({
      dns_ms: 0,
      connect_ms: 0,
      tls_ms: 0,
      ttfb_ms: 0,
      total_ms: 0,
    });
    for (const span of spans) {
      expect(Number.isFinite(span.widthPct)).toBe(true);
      expect(span.widthPct).toBe(0);
      expect(span.leftPct).toBe(0);
    }
  });

  it("clamps out-of-order timings to >= 0", () => {
    const spans = phaseSpans({
      dns_ms: 50,
      connect_ms: 20, // out of order (< dns)
      tls_ms: 20,
      ttfb_ms: 20,
      total_ms: 100,
    });
    for (const span of spans) {
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes label + color token per phase", () => {
    const spans = phaseSpans(sample);
    expect(spans.map((s) => s.label)).toEqual([
      "DNS",
      "Connect",
      "TLS",
      "TTFB",
      "Download",
    ]);
    expect(spans[0].colorToken).toBe("var(--lok-phase-dns)");
  });
});
