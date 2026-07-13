import { describe, expect, it } from "vitest";
import { createNode, PALETTE_KINDS } from "./workflowNodes";

describe("workflowNodes factory", () => {
  it("creates each palette kind with a unique id and the given position", () => {
    const ids = new Set<string>();
    for (const kind of PALETTE_KINDS) {
      const node = createNode(kind, { x: 5, y: 9 });
      expect(node.kind).toBe(kind);
      expect(node.position).toEqual({ x: 5, y: 9 });
      expect(node.id).toBeTruthy();
      ids.add(node.id);
    }
    expect(ids.size).toBe(PALETTE_KINDS.length);
  });

  it("a new request node starts as an empty reference", () => {
    const node = createNode("request", { x: 0, y: 0 });
    expect(node.kind).toBe("request");
    expect("request_ref" in node && node.request_ref).toBe("");
  });

  it("a new condition defaults to status_equals 200", () => {
    const node = createNode("condition", { x: 0, y: 0 });
    expect(node.kind).toBe("condition");
    if (node.kind === "condition") {
      expect(node.expr).toEqual({ type: "status_equals", expected: 200 });
    }
  });

  it("a new delay defaults to a bounded wait", () => {
    const node = createNode("delay", { x: 0, y: 0 });
    if (node.kind === "delay") expect(node.ms).toBeGreaterThan(0);
  });
});
