import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { workflowUpsert } from "../lib/ipc";
import { useWorkflowGraph } from "./useWorkflowGraph";
import type { Workflow } from "../lib/workflow";

vi.mock("../lib/ipc", () => ({ workflowUpsert: vi.fn() }));
const mockUpsert = vi.mocked(workflowUpsert);

const SEED: Workflow = {
  id: "w1",
  name: "Seed",
  nodes: [
    { kind: "request", id: "a", request_ref: "req-1", position: { x: 0, y: 0 } },
    { kind: "delay", id: "b", ms: 100, position: { x: 200, y: 0 } },
  ],
  edges: [{ from: "a", to: "b" }],
};

beforeEach(() => {
  mockUpsert.mockReset();
  mockUpsert.mockImplementation(async (workflow) => ({
    ...workflow,
    id: workflow.id || "minted-id",
  }));
});

afterEach(() => vi.clearAllMocks());

describe("useWorkflowGraph", () => {
  it("seeds nodes and edges from the initial workflow, not dirty", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toHaveLength(1);
    expect(result.current.dirty).toBe(false);
  });

  it("adds a node from the palette and flags dirty", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() => result.current.addNode("extract", { x: 50, y: 50 }));

    expect(result.current.nodes).toHaveLength(3);
    const added = result.current.nodes.find((n) => n.data.node.kind === "extract");
    expect(added).toBeDefined();
    expect(result.current.dirty).toBe(true);
  });

  it("connect() adds an edge between two nodes", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() =>
      result.current.connect({
        source: "b",
        target: "a",
        sourceHandle: null,
        targetHandle: null,
      }),
    );
    expect(result.current.edges.length).toBeGreaterThan(1);
    expect(result.current.dirty).toBe(true);
  });

  it("deleteNode() removes the node and prunes its edges", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() => result.current.deleteNode("a"));

    expect(result.current.nodes.find((n) => n.id === "a")).toBeUndefined();
    // the a→b edge is gone since it touched the removed node
    expect(result.current.edges).toHaveLength(0);
    expect(result.current.dirty).toBe(true);
  });

  it("updateNode() replaces the node's data", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() =>
      result.current.updateNode("b", {
        kind: "delay",
        id: "b",
        ms: 999,
        position: { x: 200, y: 0 },
      }),
    );
    const b = result.current.nodes.find((n) => n.id === "b");
    expect(b?.data.node).toMatchObject({ kind: "delay", ms: 999 });
    expect(result.current.dirty).toBe(true);
  });

  it("save() calls workflow_upsert with the reconstructed Workflow and clears dirty", async () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() => result.current.addNode("condition", { x: 400, y: 0 }));

    await act(async () => {
      await result.current.save();
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const submitted = mockUpsert.mock.calls[0][0];
    expect(submitted.id).toBe("w1");
    expect(submitted.name).toBe("Seed");
    // the reconstructed graph carries the newly added condition node
    expect(submitted.nodes.some((n) => n.kind === "condition")).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it("toWorkflow() reflects a rename", () => {
    const { result } = renderHook(() => useWorkflowGraph(SEED));
    act(() => result.current.setName("Renamed"));
    expect(result.current.name).toBe("Renamed");
    expect(result.current.toWorkflow().name).toBe("Renamed");
    expect(result.current.dirty).toBe(true);
  });
});
