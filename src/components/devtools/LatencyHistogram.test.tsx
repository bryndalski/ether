import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LatencyHistogram } from "./LatencyHistogram";
import { benchStats } from "../../lib/percentile";
import type { BenchSample } from "../../hooks/useBenchmark";

function sample(index: number, totalMs: number): BenchSample {
  return {
    index,
    totalMs,
    status: 200,
    ok: true,
    timings: {
      dns_ms: 1,
      connect_ms: 2,
      tls_ms: 3,
      ttfb_ms: 4,
      total_ms: totalMs,
    },
  };
}

describe("LatencyHistogram", () => {
  const samples = Array.from({ length: 20 }, (_, index) =>
    sample(index, 90 + index * 2),
  );
  const stats = benchStats(samples.map((s) => s.totalMs));

  it("renders percentile overlay labels p50/p95/p99", () => {
    render(
      <LatencyHistogram
        samples={samples}
        stats={stats}
        selectedIndex={null}
        onSelectSample={vi.fn()}
      />,
    );
    expect(screen.getByText(/^p50 /)).toBeInTheDocument();
    expect(screen.getByText(/^p95 /)).toBeInTheDocument();
    expect(screen.getByText(/^p99 /)).toBeInTheDocument();
  });

  it("renders bars with accessible button names", () => {
    render(
      <LatencyHistogram
        samples={samples}
        stats={stats}
        selectedIndex={null}
        onSelectSample={vi.fn()}
      />,
    );
    const bars = screen.getAllByRole("button");
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toHaveAttribute("aria-label", expect.stringMatching(/samples/));
  });

  it("clicking a bar selects a sample by index", () => {
    const onSelect = vi.fn();
    render(
      <LatencyHistogram
        samples={samples}
        stats={stats}
        selectedIndex={null}
        onSelectSample={onSelect}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(typeof onSelect.mock.calls[0][0]).toBe("number");
  });
});
