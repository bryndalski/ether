import { describe, expect, it } from "vitest";
import { edgeId, fromReactFlow, toReactFlow } from "./workflowGraph";
import type { Workflow } from "./workflow";

function sampleWorkflow(): Workflow {
  return {
    id: "w1",
    name: "Login flow",
    nodes: [
      { kind: "request", id: "a", request_ref: "req-1", position: { x: 10, y: 20 } },
      {
        kind: "extract",
        id: "x",
        source: "$.id",
        var_name: "token",
        position: { x: 200, y: 20 },
      },
      {
        kind: "condition",
        id: "c",
        expr: { type: "status_equals", expected: 200 },
        position: { x: 400, y: 20 },
      },
      { kind: "delay", id: "d", ms: 500, position: { x: 600, y: 20 } },
    ],
    edges: [
      { from: "a", to: "x" },
      { from: "x", to: "c" },
      { from: "c", to: "d", branch: true },
    ],
  };
}

describe("workflowGraph adapter", () => {
  it("toReactFlow maps nodes and edges into React Flow shape", () => {
    const { nodes, edges } = toReactFlow(sampleWorkflow());

    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({
      id: "a",
      type: "request",
      position: { x: 10, y: 20 },
    });
    expect(nodes[0].data.node.kind).toBe("request");

    expect(edges).toHaveLength(3);
    // from/to → source/target
    expect(edges[0]).toMatchObject({ source: "a", target: "x" });
    // a condition arm's branch → sourceHandle "true"
    const branchEdge = edges.find((e) => e.source === "c");
    expect(branchEdge?.sourceHandle).toBe("true");
  });

  it("round-trips a graph unchanged through to/from React Flow", () => {
    const original = sampleWorkflow();
    const { nodes, edges } = toReactFlow(original);
    const back = fromReactFlow(original.id, original.name, nodes, edges);

    expect(back.id).toBe(original.id);
    expect(back.name).toBe(original.name);
    expect(back.nodes).toEqual(original.nodes);
    expect(back.edges).toEqual(original.edges);
  });

  it("maps the true/false sourceHandle back to the branch boolean", () => {
    const workflow: Workflow = {
      id: "w",
      name: "n",
      nodes: [
        {
          kind: "condition",
          id: "c",
          expr: { type: "status_equals", expected: 200 },
          position: { x: 0, y: 0 },
        },
        { kind: "delay", id: "yes", ms: 0, position: { x: 0, y: 0 } },
        { kind: "delay", id: "no", ms: 0, position: { x: 0, y: 0 } },
      ],
      edges: [
        { from: "c", to: "yes", branch: true },
        { from: "c", to: "no", branch: false },
      ],
    };
    const { edges } = toReactFlow(workflow);
    const back = fromReactFlow("w", "n", toReactFlow(workflow).nodes, edges);

    const yes = back.edges.find((e) => e.to === "yes");
    const no = back.edges.find((e) => e.to === "no");
    expect(yes?.branch).toBe(true);
    expect(no?.branch).toBe(false);
  });

  it("a plain sequential edge round-trips with no branch key", () => {
    const workflow: Workflow = {
      id: "w",
      name: "n",
      nodes: [
        { kind: "delay", id: "a", ms: 0, position: { x: 0, y: 0 } },
        { kind: "delay", id: "b", ms: 0, position: { x: 0, y: 0 } },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const { nodes, edges } = toReactFlow(workflow);
    const back = fromReactFlow("w", "n", nodes, edges);
    expect(back.edges[0]).toEqual({ from: "a", to: "b" });
    expect("branch" in back.edges[0]).toBe(false);
  });

  it("edgeId is stable and distinguishes branches", () => {
    expect(edgeId({ from: "a", to: "b" })).toBe("a->b:seq");
    expect(edgeId({ from: "c", to: "d", branch: true })).toBe("c->d:true");
    expect(edgeId({ from: "c", to: "e", branch: false })).toBe("c->e:false");
  });
});
