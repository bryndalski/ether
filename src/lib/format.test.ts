import { describe, expect, it } from "vitest";
import { formatMs, humanBytes } from "./format";

describe("formatMs", () => {
  it("rounds to a whole millisecond", () => {
    expect(formatMs(148.4)).toBe("148");
    expect(formatMs(148.6)).toBe("149");
  });

  it("guards negative / non-finite durations", () => {
    expect(formatMs(-5)).toBe("0");
    expect(formatMs(Number.NaN)).toBe("0");
  });
});

describe("humanBytes", () => {
  it("renders bytes under 1 KiB as B", () => {
    expect(humanBytes(512)).toBe("512 B");
  });

  it("renders KB with two decimals", () => {
    expect(humanBytes(1270)).toBe("1.24 KB");
  });

  it("renders MB with two decimals", () => {
    expect(humanBytes(2 * 1024 * 1024)).toBe("2.00 MB");
  });

  it("guards zero / negative", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(-1)).toBe("0 B");
  });
});
