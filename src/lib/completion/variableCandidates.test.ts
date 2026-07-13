import { describe, expect, it } from "vitest";
import {
  buildVariableCandidates,
  type CandidateSources,
  type CandidateStrings,
} from "./variableCandidates";
import type { MergedVar } from "../envMerge";

const strings: CandidateStrings = {
  secretDetail: "secret",
  dynamic: {
    uuid: "random UUID v4",
    timestamp: "Unix seconds",
    timestampMs: "Unix milliseconds",
    datetimeIso: "ISO-8601 / RFC-3339 now",
    randomInt: "random integer in [a,b]",
    randomHex: "n random bytes, hex",
    base64: "base64-encode text",
  },
};

function build(partial: Partial<CandidateSources>) {
  return buildVariableCandidates({ vars: [], strings, ...partial });
}

describe("buildVariableCandidates", () => {
  it("emits env candidates carrying the public value in detail", () => {
    const vars: MergedVar[] = [
      { name: "host", value: "api.example.com", isSecret: false, source: "own" },
      { name: "token", value: "abc123", isSecret: false, source: "own" },
    ];
    const result = build({ vars });
    const host = result.find((c) => c.insert === "{{env.host}}");
    const token = result.find((c) => c.insert === "{{env.token}}");
    expect(host).toMatchObject({ label: "env.host", kind: "env", detail: "api.example.com" });
    expect(token).toMatchObject({ label: "env.token", kind: "env", detail: "abc123" });
  });

  it("emits secrets by NAME only and never the value (even if leaked into the row)", () => {
    const leaky: MergedVar = {
      name: "API_KEY",
      // A well-behaved store yields "" for secrets; simulate a leak to prove the
      // builder still refuses to surface the value.
      value: "sk-super-secret-value",
      isSecret: true,
      source: "own",
    };
    const result = build({ vars: [leaky] });
    const secret = result.find((c) => c.insert === "{{secret.API_KEY}}");
    expect(secret).toBeDefined();
    expect(secret?.kind).toBe("secret");
    expect(secret?.detail).toBe(strings.secretDetail);
    // Hard invariant: nowhere in the emitted payload does the value appear.
    for (const candidate of result) {
      expect(candidate.insert).not.toContain("sk-super-secret-value");
      expect(candidate.detail).not.toContain("sk-super-secret-value");
    }
  });

  it("emits all dynamic functions matching interp.rs exactly (snapshot of inserts)", () => {
    const inserts = build({})
      .filter((c) => c.kind === "dynamic")
      .map((c) => c.insert)
      .sort();
    expect(inserts.sort()).toEqual(
      [
        "{{$uuid}}",
        "{{$timestamp}}",
        "{{$timestamp_ms}}",
        "{{$datetime.iso}}",
        "{{$random.int(${1:0},${2:9})}}",
        "{{$random.hex(${1:16})}}",
        "{{$base64(${1:text})}}",
      ].sort(),
    );
  });

  it("gates run-vars: absent when omitted/empty, present as {{var.NAME}} when provided", () => {
    expect(build({}).some((c) => c.kind === "runvar")).toBe(false);
    expect(build({ runVarNames: [] }).some((c) => c.kind === "runvar")).toBe(false);
    const withRun = build({ runVarNames: ["step1"] });
    expect(withRun.find((c) => c.kind === "runvar")).toMatchObject({
      insert: "{{var.step1}}",
      label: "var.step1",
    });
  });

  it("orders env before secret before dynamic and de-dups by insert", () => {
    const vars: MergedVar[] = [
      { name: "host", value: "h", isSecret: false, source: "own" },
      { name: "host", value: "h", isSecret: false, source: "own" }, // duplicate
      { name: "API_KEY", value: "", isSecret: true, source: "own" },
    ];
    const result = build({ vars });
    const envIndex = result.findIndex((c) => c.kind === "env");
    const secretIndex = result.findIndex((c) => c.kind === "secret");
    const dynamicIndex = result.findIndex((c) => c.kind === "dynamic");
    expect(envIndex).toBeLessThan(secretIndex);
    expect(secretIndex).toBeLessThan(dynamicIndex);
    expect(result.filter((c) => c.insert === "{{env.host}}")).toHaveLength(1);
  });
});
