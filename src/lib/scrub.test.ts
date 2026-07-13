import { describe, expect, it } from "vitest";
import { scrubValue, scrubBody, SCRUBBED } from "./scrub";
import type { ScrubConfig } from "./types";

const config = (patch: Partial<ScrubConfig> = {}): ScrubConfig => ({
  paths: [],
  auto_timestamps: false,
  auto_uuids: false,
  ...patch,
});

describe("scrubValue", () => {
  it("scrubs an explicit leaf path", () => {
    const out = scrubValue({ a: 1, b: 2 }, config({ paths: ["$.a"] }));
    expect(out).toEqual({ a: SCRUBBED, b: 2 });
  });

  it("scrubs a whole subtree at an explicit path", () => {
    const out = scrubValue({ meta: { id: 1, ts: "x" }, keep: 9 }, config({ paths: ["$.meta"] }));
    expect(out).toEqual({ meta: SCRUBBED, keep: 9 });
  });

  it("auto-scrubs ISO-8601 timestamps but leaves non-ISO strings", () => {
    const out = scrubValue(
      { at: "2026-07-13T10:20:30Z", label: "hello" },
      config({ auto_timestamps: true }),
    );
    expect(out).toEqual({ at: SCRUBBED, label: "hello" });
  });

  it("auto-scrubs RFC-4122 UUIDs but leaves non-uuid strings", () => {
    const out = scrubValue(
      { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", name: "not-a-uuid" },
      config({ auto_uuids: true }),
    );
    expect(out).toEqual({ id: SCRUBBED, name: "not-a-uuid" });
  });

  it("never auto-scrubs numbers (epoch millis are ambiguous)", () => {
    const out = scrubValue({ epoch: 1_700_000_000_000 }, config({ auto_timestamps: true }));
    expect(out).toEqual({ epoch: 1_700_000_000_000 });
  });

  it("does not mutate the input", () => {
    const input = { a: "2026-07-13T00:00:00Z", nested: { b: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    scrubValue(input, config({ auto_timestamps: true, paths: ["$.nested.b"] }));
    expect(input).toEqual(snapshot);
  });

  it("is idempotent (scrub ∘ scrub === scrub)", () => {
    const cfg = config({ paths: ["$.a"], auto_uuids: true });
    const once = scrubValue({ a: 1, id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }, cfg);
    const twice = scrubValue(once, cfg);
    expect(twice).toEqual(once);
  });
});

describe("scrubBody", () => {
  it("returns ok:false for a non-JSON body", () => {
    expect(scrubBody("plain text", config())).toEqual({ ok: false, reason: "non-JSON body" });
  });

  it("scrubs a JSON body", () => {
    const result = scrubBody(JSON.stringify({ a: 1 }), config({ paths: ["$.a"] }));
    expect(result).toEqual({ ok: true, value: { a: SCRUBBED } });
  });
});
