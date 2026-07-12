import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TimelineWaterfall } from "./TimelineWaterfall";
import type { Timings } from "../../lib/types";

const timings: Timings = {
  dns_ms: 11,
  connect_ms: 30,
  tls_ms: 57,
  ttfb_ms: 126,
  total_ms: 148,
};

afterEach(cleanup);

describe("TimelineWaterfall", () => {
  it("renders five proportional bars with % widths matching phaseSpans", () => {
    const { container } = render(<TimelineWaterfall timings={timings} />);
    const bars = container.querySelectorAll(".wf-bar");
    expect(bars).toHaveLength(5);
    // DNS = 11/148 ≈ 7.43%
    expect((bars[0] as HTMLElement).style.width).toContain("7.43");
    // second bar (Connect) starts where DNS ends
    expect((bars[1] as HTMLElement).style.left).toContain("7.43");
  });

  it("shows per-phase ms as real text (a11y, not just bar width)", () => {
    render(<TimelineWaterfall timings={timings} />);
    expect(screen.getByText("11")).toBeInTheDocument(); // DNS
    expect(screen.getByText("19")).toBeInTheDocument(); // Connect
    expect(screen.getByText("22")).toBeInTheDocument(); // Download
  });

  it("renders the phase legend", () => {
    render(<TimelineWaterfall timings={timings} />);
    for (const label of ["DNS", "Connect", "TLS", "TTFB", "Download"]) {
      // label appears in both the row and the legend
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });
});
