import { describe, expect, it } from "vitest";
import { draftReducer } from "./useRequestDraft";
import type { RequestSpec, StoredRequest } from "../lib/types";

function seed(overrides: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: "req-1",
    collection_id: "col-1",
    name: "List users",
    method: "GET",
    url: "https://api/x",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: {
      follow_redirects: true,
      max_redirects: 10,
      timeout_ms: 30_000,
      insecure: false,
      ca_bundle_path: null,
      compressed: true,
      cookie_jar: null,
    },
    sort_order: 0,
    docs_md: null,
    graphql: null,
    ...overrides,
  };
}

describe("draftReducer", () => {
  it("rebuilds the URL from params (Params → URL)", () => {
    const next = draftReducer(seed(), {
      kind: "setParams",
      params: [{ name: "q", value: "a", enabled: true }],
    });
    expect(next.url).toBe("https://api/x?q=a");
    expect(next.query_params).toEqual([{ name: "q", value: "a", enabled: true }]);
  });

  it("parses params out of a new URL (URL → Params) without looping", () => {
    const once = draftReducer(seed(), {
      kind: "setUrl",
      url: "https://api/x?limit=25",
    });
    expect(once.query_params).toEqual([
      { name: "limit", value: "25", enabled: true },
    ]);
    // A second identical dispatch is stable (idempotent, no runaway loop).
    const twice = draftReducer(once, {
      kind: "setUrl",
      url: "https://api/x?limit=25",
    });
    expect(twice.query_params).toEqual(once.query_params);
    expect(twice.url).toBe(once.url);
  });

  it("preserves raw text across content-type flips", () => {
    const asJson = draftReducer(seed(), {
      kind: "setBody",
      body: { type: "raw", content_type: "application/json", text: '{"a":1}' },
    });
    const asXml = draftReducer(asJson, {
      kind: "setBody",
      body: { type: "raw", content_type: "application/xml", text: '{"a":1}' },
    });
    expect(asXml.body).toEqual({
      type: "raw",
      content_type: "application/xml",
      text: '{"a":1}',
    });
  });

  it("importSpec keeps identity fields and takes spec request fields", () => {
    const spec: RequestSpec = {
      id: "ignored",
      method: "POST",
      url: "https://api/y?token=abc",
      headers: [{ name: "X-A", value: "1", enabled: true }],
      query_params: [],
      body: { type: "raw", content_type: "application/json", text: "{}" },
      auth: { type: "bearer", token: "{{secret.t}}" },
      options: seed().options,
    };
    const next = draftReducer(seed(), { kind: "importSpec", spec });
    // identity fields kept from the current draft
    expect(next.id).toBe("req-1");
    expect(next.collection_id).toBe("col-1");
    expect(next.name).toBe("List users");
    // request fields taken from the spec
    expect(next.method).toBe("POST");
    expect(next.url).toBe("https://api/y?token=abc");
    expect(next.headers).toEqual([{ name: "X-A", value: "1", enabled: true }]);
    expect(next.auth).toEqual({ type: "bearer", token: "{{secret.t}}" });
    // query_params re-parsed from the spec URL
    expect(next.query_params).toEqual([
      { name: "token", value: "abc", enabled: true },
    ]);
  });

  it("seed makes the draft deep-equal the seed StoredRequest (identity payload)", () => {
    const s = seed({ url: "https://api/x?a=1" });
    const next = draftReducer(seed(), { kind: "seed", request: s });
    expect(next).toEqual(s);
  });
});
