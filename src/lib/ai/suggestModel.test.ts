import { describe, expect, it } from "vitest";
import { suggestModel } from "./suggestModel";

const GB = 1024 * 1024 * 1024;

describe("suggestModel", () => {
  it("< 8 GB → llama3.2:3b (small + fast)", () => {
    expect(suggestModel(4 * GB)).toEqual({ name: "llama3.2:3b", noteKey: "ai.suggestSmallFast" });
    // just below the 8 GB boundary
    expect(suggestModel(8 * GB - 1).name).toBe("llama3.2:3b");
  });

  it("8–16 GB → llama3.1:8b (balanced), inclusive at the low boundary", () => {
    expect(suggestModel(8 * GB)).toEqual({ name: "llama3.1:8b", noteKey: "ai.suggestBalanced" });
    expect(suggestModel(16 * GB - 1).name).toBe("llama3.1:8b");
  });

  it("≥ 16 GB → qwen2.5-coder:7b (strong code), inclusive at the boundary", () => {
    expect(suggestModel(16 * GB)).toEqual({
      name: "qwen2.5-coder:7b",
      noteKey: "ai.suggestStrongCode",
    });
    expect(suggestModel(64 * GB).name).toBe("qwen2.5-coder:7b");
  });

  it("null/unknown RAM defaults to the balanced 8b model", () => {
    expect(suggestModel(null).name).toBe("llama3.1:8b");
    expect(suggestModel(Number.NaN).name).toBe("llama3.1:8b");
  });
});
