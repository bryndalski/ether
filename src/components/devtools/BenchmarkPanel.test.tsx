import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BenchmarkPanel } from "./BenchmarkPanel";
import type { BenchState } from "../../hooks/useBenchmark";

const baseState: BenchState = {
  phase: "idle",
  config: { iterations: 20, concurrency: 1 },
  completed: 0,
  samples: [],
  stats: null,
  error: null,
  selectedIndex: null,
};

function renderPanel(state: BenchState) {
  return render(
    <BenchmarkPanel
      benchState={state}
      host="api.example.com"
      isProd={false}
      hasRedactedSecrets={false}
      onRun={vi.fn()}
      onCancel={vi.fn()}
      onSelectSample={vi.fn()}
    />,
  );
}

describe("BenchmarkPanel warning gate", () => {
  it("shows the 'wykona N realnych requestów' warning before any run", () => {
    renderPanel(baseState);
    expect(
      screen.getByText(/will run/i),
    ).toBeInTheDocument();
    expect(screen.getByText("api.example.com")).toBeInTheDocument();
    // The only start control is the explicit "Uruchom benchmark".
    expect(
      screen.getByRole("button", { name: /run benchmark/i }),
    ).toBeInTheDocument();
  });

  it("shows x/N progress and a Cancel button while running", () => {
    renderPanel({ ...baseState, phase: "running", completed: 7 });
    expect(screen.getByText("7 / 20")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
