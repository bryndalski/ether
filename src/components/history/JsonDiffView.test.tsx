import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { JsonDiffView } from "./JsonDiffView";
import { TimingDiffView } from "./TimingDiffView";
import type { JsonDiffEntry } from "../../lib/jsonDiff";
import type { PhaseDelta } from "../../lib/timingDiff";

afterEach(cleanup);

describe("JsonDiffView", () => {
  it("renders one of each kind with sigils and kind badges (not color-only)", () => {
    const entries: JsonDiffEntry[] = [
      { path: "$.a", kind: "added", after: 1 },
      { path: "$.b", kind: "removed", before: 2 },
      { path: "$.c", kind: "changed", before: 3, after: 4 },
      {
        path: "$.n",
        kind: "type-changed",
        before: 1,
        after: "1",
        beforeType: "number",
        afterType: "string",
      },
    ];
    render(<JsonDiffView entries={entries} />);
    // sigils present
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("−")).toBeInTheDocument();
    expect(screen.getAllByText("~")).toHaveLength(2);
    // kind badges present
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
    // type-changed shows the number → string transition + a Type pill.
    // The line text lives in the row's aria-label (split across spans in the DOM).
    expect(screen.getByLabelText(/Type changed \$\.n:.*number → string/)).toBeInTheDocument();
    // Both the kind badge ("Type") and the extra Type pill render.
    expect(screen.getAllByText("Type").length).toBeGreaterThanOrEqual(1);
    // aria-labels carry meaning for screen readers
    expect(screen.getByLabelText(/Added \$\.a/)).toBeInTheDocument();
  });

  it("shows the identical-body state for an empty diff", () => {
    render(<JsonDiffView entries={[]} />);
    expect(screen.getByText("Responses are identical (body).")).toBeInTheDocument();
  });

  it("falls back to a text diff for non-JSON bodies", () => {
    render(<JsonDiffView entries={[]} fallback={{ before: "<a>", after: "<b>" }} />);
    expect(screen.getByText(/text diff/)).toBeInTheDocument();
  });
});

describe("TimingDiffView", () => {
  const rows: PhaseDelta[] = [
    { phase: "dns", beforeMs: 0, afterMs: 0, deltaMs: 0, faster: false, pctChange: null },
    { phase: "total", beforeMs: 100, afterMs: 80, deltaMs: -20, faster: true, pctChange: -20 },
  ];

  it("renders per-phase + total rows and colors a faster total", () => {
    render(<TimingDiffView deltas={rows} />);
    expect(screen.getByText("Total")).toBeInTheDocument();
    // faster row: -20% (pctChange uses an ASCII minus) and faster-classed cells
    expect(screen.getByText("-20%")).toBeInTheDocument();
    expect(screen.getByLabelText(/Total: faster by 20 ms/)).toBeInTheDocument();
    // before === 0 phase shows "—" (guarded pct)
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
