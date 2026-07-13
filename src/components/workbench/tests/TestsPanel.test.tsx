import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TestsPanel } from "./TestsPanel";
import type { Assertion, ScrubConfig } from "../../../lib/types";

afterEach(cleanup);

const scrub: ScrubConfig = { paths: [], auto_timestamps: false, auto_uuids: false };

describe("TestsPanel", () => {
  it("renders a row per assertion with the enable checkbox", () => {
    const assertions: Assertion[] = [
      { type: "status_equals", expected: 200, enabled: true },
      { type: "body_contains", substring: "ok", enabled: false },
    ];
    render(
      <TestsPanel
        assertions={assertions}
        onAssertionsChange={() => {}}
        scrubConfig={scrub}
        onScrubConfigChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Assertion type 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Assertion type 2")).toBeInTheDocument();
  });

  it("adding a row dispatches a new default status_equals", () => {
    const onChange = vi.fn();
    render(
      <TestsPanel
        assertions={[]}
        onAssertionsChange={onChange}
        scrubConfig={scrub}
        onScrubConfigChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Add assertion"));
    expect(onChange).toHaveBeenCalledWith([
      { type: "status_equals", expected: 200, enabled: true },
    ]);
  });

  it("the assertion type menu offers all nine types", () => {
    render(
      <TestsPanel
        assertions={[{ type: "status_equals", expected: 200, enabled: true }]}
        onAssertionsChange={() => {}}
        scrubConfig={scrub}
        onScrubConfigChange={() => {}}
      />,
    );
    const select = screen.getByLabelText("Assertion type 1") as HTMLSelectElement;
    expect(select.options).toHaveLength(9);
  });
});
