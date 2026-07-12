import { describe, expect, it } from "vitest";
import { buildUrl, parseQuery } from "./urlParams";
import type { KeyValue } from "./types";

describe("parseQuery", () => {
  it("parses a simple query string", () => {
    expect(parseQuery("https://api/x?a=1&b=2")).toEqual([
      { name: "a", value: "1", enabled: true },
      { name: "b", value: "2", enabled: true },
    ]);
  });

  it("returns [] when there is no query", () => {
    expect(parseQuery("https://api/x")).toEqual([]);
    expect(parseQuery("https://api/x?")).toEqual([]);
  });

  it("keeps template tokens un-encoded", () => {
    expect(parseQuery("https://api/x?limit={{env.pageSize}}")).toEqual([
      { name: "limit", value: "{{env.pageSize}}", enabled: true },
    ]);
  });

  it("decodes percent-encoded literal values", () => {
    expect(parseQuery("https://api/x?q=a%20b")).toEqual([
      { name: "q", value: "a b", enabled: true },
    ]);
  });

  it("preserves the prior enabled flag by name", () => {
    const previous: KeyValue[] = [{ name: "a", value: "old", enabled: false }];
    expect(parseQuery("https://api/x?a=1&b=2", previous)).toEqual([
      { name: "a", value: "1", enabled: false },
      { name: "b", value: "2", enabled: true },
    ]);
  });
});

describe("buildUrl", () => {
  it("appends enabled params as a query string", () => {
    const params: KeyValue[] = [{ name: "q", value: "a", enabled: true }];
    expect(buildUrl("https://api/x", params)).toBe("https://api/x?q=a");
  });

  it("drops disabled and blank-name params", () => {
    const params: KeyValue[] = [
      { name: "a", value: "1", enabled: true },
      { name: "b", value: "2", enabled: false },
      { name: "", value: "3", enabled: true },
    ];
    expect(buildUrl("https://api/x?old=1", params)).toBe("https://api/x?a=1");
  });

  it("percent-encodes literal values but not template tokens", () => {
    const params: KeyValue[] = [
      { name: "q", value: "a b", enabled: true },
      { name: "limit", value: "{{env.pageSize}}", enabled: true },
    ];
    expect(buildUrl("https://api/x", params)).toBe(
      "https://api/x?q=a%20b&limit={{env.pageSize}}",
    );
  });

  it("clears the query when no params remain", () => {
    expect(buildUrl("https://api/x?a=1", [])).toBe("https://api/x");
  });

  it("round-trips parse → build for template-bearing queries", () => {
    const url = "https://api/x?limit={{env.pageSize}}&q=a";
    const params = parseQuery(url);
    expect(buildUrl("https://api/x", params)).toBe(url);
  });
});
