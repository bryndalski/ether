import { describe, expect, it } from "vitest";
import { evalAssertions, summarize, resolveJsonPath } from "./assertions";
import type { Assertion, ResponseData } from "./types";

function response(patch: Partial<ResponseData> = {}): ResponseData {
  return {
    request_id: "r1",
    status: 200,
    http_version: "2",
    headers: [
      { name: "Content-Type", value: "application/json", enabled: true },
      { name: "X-Multi", value: "a", enabled: true },
      { name: "X-Multi", value: "b", enabled: true },
    ],
    body: JSON.stringify({
      data: { id: 42, name: "lok", active: true, tags: ["x", "y"], nested: null },
    }),
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 20,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 120 },
    effective_url: "https://api.test",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
    ...patch,
  };
}

function evalOne(a: Assertion, patch: Partial<ResponseData> = {}) {
  return evalAssertions(response(patch), [a])[0];
}

describe("resolveJsonPath", () => {
  it("resolves root, keys and array indices", () => {
    const root = { a: { b: [10, 20] } };
    expect(resolveJsonPath(root, "$")).toEqual({ found: true, value: root });
    expect(resolveJsonPath(root, "$.a.b[1]")).toEqual({ found: true, value: 20 });
    expect(resolveJsonPath(root, "$.a.missing")).toEqual({ found: false, value: undefined });
  });
});

describe("evalAssertions — one per type", () => {
  it("status_equals pass/fail", () => {
    expect(evalOne({ type: "status_equals", expected: 200, enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "status_equals", expected: 201, enabled: true }).status).toBe("fail");
  });

  it("status_in_range inclusive bounds", () => {
    const a: Assertion = { type: "status_in_range", min: 200, max: 299, enabled: true };
    expect(evalOne(a, { status: 200 }).status).toBe("pass");
    expect(evalOne(a, { status: 299 }).status).toBe("pass");
    expect(evalOne(a, { status: 300 }).status).toBe("fail");
    expect(evalOne(a, { status: 199 }).status).toBe("fail");
  });

  it("header_exists is case-insensitive", () => {
    expect(evalOne({ type: "header_exists", name: "content-type", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "header_exists", name: "x-absent", enabled: true }).status).toBe("fail");
  });

  it("header_equals joins multi-value headers with ', '", () => {
    expect(
      evalOne({ type: "header_equals", name: "x-multi", expected: "a, b", enabled: true }).status,
    ).toBe("pass");
    expect(
      evalOne({ type: "header_equals", name: "x-multi", expected: "a", enabled: true }).status,
    ).toBe("fail");
  });

  it("json_path_exists treats a present null node as existing", () => {
    expect(evalOne({ type: "json_path_exists", path: "$.data.nested", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_exists", path: "$.data.nope", enabled: true }).status).toBe("fail");
  });

  it("json_path_equals coerces '42'↔42 and 'true'↔true", () => {
    expect(evalOne({ type: "json_path_equals", path: "$.data.id", expected: "42", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_equals", path: "$.data.active", expected: "true", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_equals", path: "$.data.name", expected: "lok", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_equals", path: "$.data.id", expected: "43", enabled: true }).status).toBe("fail");
  });

  it("json_path_type distinguishes array from object", () => {
    expect(evalOne({ type: "json_path_type", path: "$.data.tags", expected_type: "array", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_type", path: "$.data", expected_type: "object", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "json_path_type", path: "$.data.tags", expected_type: "object", enabled: true }).status).toBe("fail");
  });

  it("body_contains raw substring search", () => {
    expect(evalOne({ type: "body_contains", substring: "lok", enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "body_contains", substring: "zzz", enabled: true }).status).toBe("fail");
  });

  it("response_time_below compares total_ms", () => {
    expect(evalOne({ type: "response_time_below", max_ms: 200, enabled: true }).status).toBe("pass");
    expect(evalOne({ type: "response_time_below", max_ms: 100, enabled: true }).status).toBe("fail");
  });
});

describe("evalAssertions — robustness", () => {
  it("json_path against non-JSON body fails without throwing", () => {
    const result = evalOne(
      { type: "json_path_equals", path: "$.a", expected: "1", enabled: true },
      { body: "not json" },
    );
    expect(result.status).toBe("fail");
    expect(result.message).toContain("JSON");
  });

  it("json_path against base64 body reports a binary body", () => {
    const result = evalOne(
      { type: "json_path_exists", path: "$.a", enabled: true },
      { body: "AAAA", body_is_base64: true },
    );
    expect(result.status).toBe("fail");
    expect(result.message).toContain("binarne");
  });

  it("disabled assertion becomes skipped", () => {
    expect(evalOne({ type: "status_equals", expected: 200, enabled: false }).status).toBe("skipped");
  });

  it("summarize counts pass/fail/skipped and allPassed", () => {
    const results = evalAssertions(response(), [
      { type: "status_equals", expected: 200, enabled: true },
      { type: "status_equals", expected: 500, enabled: true },
      { type: "status_equals", expected: 200, enabled: false },
    ]);
    const summary = summarize(results);
    expect(summary).toEqual({ total: 3, passed: 1, failed: 1, skipped: 1, allPassed: false });
  });

  it("allPassed is true when only passes and skips exist", () => {
    const results = evalAssertions(response(), [
      { type: "status_equals", expected: 200, enabled: true },
      { type: "status_equals", expected: 500, enabled: false },
    ]);
    expect(summarize(results).allPassed).toBe(true);
  });
});
