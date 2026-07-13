import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UseWatchMode } from "../../../hooks/useWatchMode";
import { WatchPanel } from "./WatchPanel";

afterEach(cleanup);

function makeWatch(overrides: Partial<UseWatchMode> = {}): UseWatchMode {
  return {
    watching: false,
    runs: [],
    start: vi.fn(),
    stop: vi.fn(),
    config: { intervalSec: 5, onInterval: true, onDraftChange: false, maxRuns: 10 },
    setConfig: vi.fn(),
    ...overrides,
  };
}

describe("WatchPanel", () => {
  it("renders a Start trigger when idle and calls start() on click", () => {
    const watch = makeWatch({ watching: false });
    render(<WatchPanel watch={watch} />);

    const startButton = screen.getByRole("button", { name: "Start watch" });
    expect(startButton).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop watch" })).toBeNull();

    fireEvent.click(startButton);
    expect(watch.start).toHaveBeenCalledTimes(1);
  });

  it("swaps Start for Stop while watching and calls stop() on click", () => {
    const watch = makeWatch({ watching: true });
    render(<WatchPanel watch={watch} />);

    expect(screen.queryByRole("button", { name: "Start watch" })).toBeNull();
    const stopButton = screen.getByRole("button", { name: "Stop watch" });

    fireEvent.click(stopButton);
    expect(watch.stop).toHaveBeenCalledTimes(1);
  });
});
