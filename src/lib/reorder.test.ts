import { describe, expect, it } from "vitest";
import { reorderSiblings } from "./reorder";

function items(...ids: string[]) {
  return ids.map((id, index) => ({ id, sort_order: index }));
}

describe("reorderSiblings", () => {
  it("moves an item down and densely renumbers only what changed", () => {
    const changed = reorderSiblings(items("a", "b", "c", "d"), "a", 2);
    // a b c d → b c a d ; a:0→2, b:1→0, c:2→1, d unchanged
    expect(changed).toEqual([
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "a", sort_order: 2 },
    ]);
  });

  it("moves an item up", () => {
    const changed = reorderSiblings(items("a", "b", "c"), "c", 0);
    // a b c → c a b
    expect(changed).toEqual([
      { id: "c", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("clamps a past-the-end target to the tail", () => {
    const changed = reorderSiblings(items("a", "b", "c"), "a", 99);
    expect(changed).toEqual([
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "a", sort_order: 2 },
    ]);
  });

  it("is a no-op when the item does not move", () => {
    expect(reorderSiblings(items("a", "b", "c"), "b", 1)).toEqual([]);
  });

  it("returns nothing for an unknown id", () => {
    expect(reorderSiblings(items("a", "b"), "zzz", 0)).toEqual([]);
  });
});
