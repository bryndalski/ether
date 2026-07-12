import { describe, expect, it } from "vitest";
import { headersDiff, jsonDiff, jsonType, parseJsonBody } from "./jsonDiff";
import type { KeyValue } from "./types";

const kv = (name: string, value: string): KeyValue => ({
  name,
  value,
  enabled: true,
});

describe("jsonDiff", () => {
  it("reports an added key present only in after", () => {
    const entries = jsonDiff({ a: 1 }, { a: 1, b: 2 });
    expect(entries).toEqual([{ path: "$.b", kind: "added", after: 2 }]);
  });

  it("reports a removed key present only in before", () => {
    const entries = jsonDiff({ a: 1, b: 2 }, { a: 1 });
    expect(entries).toEqual([{ path: "$.b", kind: "removed", before: 2 }]);
  });

  it("reports a changed value of the same type", () => {
    const entries = jsonDiff({ a: 1 }, { a: 2 });
    expect(entries).toEqual([
      { path: "$.a", kind: "changed", before: 1, after: 2 },
    ]);
  });

  it("distinguishes type-changed (number → string) from a value change", () => {
    const entries = jsonDiff({ n: 1 }, { n: "1" });
    expect(entries).toEqual([
      {
        path: "$.n",
        kind: "type-changed",
        before: 1,
        after: "1",
        beforeType: "number",
        afterType: "string",
      },
    ]);
  });

  it("treats object → array as a type change (not a recurse)", () => {
    const entries = jsonDiff({ x: { a: 1 } }, { x: [1] });
    expect(entries[0].kind).toBe("type-changed");
    expect(entries[0].beforeType).toBe("object");
    expect(entries[0].afterType).toBe("array");
  });

  it("treats null → object as a type change", () => {
    const entries = jsonDiff({ x: null }, { x: { a: 1 } });
    expect(entries[0].kind).toBe("type-changed");
    expect(entries[0].beforeType).toBe("null");
    expect(entries[0].afterType).toBe("object");
  });

  it("resolves nested paths and array positions", () => {
    const before = { data: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] } };
    const after = { data: { items: [{ id: 1 }, { id: 2 }, { id: 9 }] } };
    const entries = jsonDiff(before, after);
    expect(entries).toEqual([
      { path: "$.data.items[2].id", kind: "changed", before: 3, after: 9 },
    ]);
  });

  it("returns [] for identical bodies", () => {
    expect(jsonDiff({ a: [1, 2], b: "x" }, { a: [1, 2], b: "x" })).toEqual([]);
  });
});

describe("jsonType", () => {
  it("distinguishes array, null and object", () => {
    expect(jsonType([])).toBe("array");
    expect(jsonType(null)).toBe("null");
    expect(jsonType({})).toBe("object");
    expect(jsonType(3)).toBe("number");
  });
});

describe("parseJsonBody", () => {
  it("parses valid JSON", () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("fails on non-JSON / truncated bodies so the view can fall back to text", () => {
    expect(parseJsonBody('{"a":1').ok).toBe(false);
    expect(parseJsonBody("<html>").ok).toBe(false);
    expect(parseJsonBody("").ok).toBe(false);
  });
});

describe("headersDiff", () => {
  it("matches header names case-insensitively", () => {
    const entries = headersDiff(
      [kv("Content-Type", "application/json")],
      [kv("content-type", "text/plain")],
    );
    expect(entries).toEqual([
      {
        name: "content-type",
        kind: "changed",
        before: "application/json",
        after: "text/plain",
      },
    ]);
  });

  it("reports added and removed headers", () => {
    const entries = headersDiff([kv("X-Old", "1")], [kv("X-New", "2")]);
    const kinds = Object.fromEntries(entries.map((e) => [e.name, e.kind]));
    expect(kinds["X-Old"]).toBe("removed");
    expect(kinds["X-New"]).toBe("added");
  });

  it("returns [] when headers are identical", () => {
    expect(headersDiff([kv("A", "1")], [kv("A", "1")])).toEqual([]);
  });
});
