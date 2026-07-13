import { describe, expect, it } from "vitest";
import { computeUrlRanges } from "./urlHighlight";

describe("computeUrlRanges", () => {
  it("splits scheme+host, path and query", () => {
    const url = "https://api.example.com/users?limit=25";
    const ranges = computeUrlRanges(url);
    const slice = (part: string) => {
      const r = ranges.find((range) => range.part === part)!;
      return url.slice(r.from, r.to);
    };
    expect(slice("host")).toBe("https://api.example.com");
    expect(slice("path")).toBe("/users");
    expect(slice("query")).toBe("?limit=25");
  });

  it("marks the whole string as host when there is no path or query", () => {
    expect(computeUrlRanges("https://api.example.com")).toEqual([
      { from: 0, to: 23, part: "host" },
    ]);
  });

  it("handles a bare host with a query but no path", () => {
    const url = "https://api?x=1";
    const ranges = computeUrlRanges(url);
    expect(ranges.map((r) => r.part)).toEqual(["host", "query"]);
    expect(url.slice(ranges[1].from, ranges[1].to)).toBe("?x=1");
  });

  it("returns no ranges for an empty string", () => {
    expect(computeUrlRanges("")).toEqual([]);
  });

  it("treats a schemeless value as host up to the first slash", () => {
    const url = "api.example.com/v1/users";
    const ranges = computeUrlRanges(url);
    expect(url.slice(ranges[0].from, ranges[0].to)).toBe("api.example.com");
    expect(url.slice(ranges[1].from, ranges[1].to)).toBe("/v1/users");
  });
});
