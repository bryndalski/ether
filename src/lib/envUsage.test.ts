import { describe, expect, it } from "vitest";
import { countRequestsUsingVariable } from "./envUsage";
import type { StoredRequest } from "./types";

function req(partial: Partial<StoredRequest>): StoredRequest {
  return {
    id: "r",
    collection_id: "c",
    name: "r",
    method: "GET",
    url: "",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: {
      follow_redirects: true,
      max_redirects: 5,
      timeout_ms: 30000,
      insecure: false,
      ca_bundle_path: null,
      compressed: true,
      cookie_jar: null,
    },
    sort_order: 0,
    docs_md: null,
    graphql: null,
    assertions: [],
    ...partial,
  };
}

describe("countRequestsUsingVariable", () => {
  it("counts a variable referenced in the url", () => {
    const requests = [
      req({ url: "https://{{host}}/api" }),
      req({ url: "https://example.com" }),
    ];
    expect(countRequestsUsingVariable(requests, "host")).toBe(1);
  });

  it("counts across headers, body and graphql, once per request", () => {
    const requests = [
      req({
        headers: [{ name: "Authorization", value: "Bearer {{token}}", enabled: true }],
        body: { type: "raw", content_type: "application/json", text: '{"t":"{{token}}"}' },
      }),
      req({
        graphql: { operation_type: "query", query: "query { me }", variables_json: '{"id":"{{token}}"}' },
      }),
    ];
    // first request uses {{token}} twice but is counted once
    expect(countRequestsUsingVariable(requests, "token")).toBe(2);
  });

  it("returns 0 for an empty or unused name", () => {
    const requests = [req({ url: "https://{{host}}/api" })];
    expect(countRequestsUsingVariable(requests, "")).toBe(0);
    expect(countRequestsUsingVariable(requests, "missing")).toBe(0);
  });

  it("does not match a partial token name", () => {
    const requests = [req({ url: "https://{{hostname}}/x" })];
    expect(countRequestsUsingVariable(requests, "host")).toBe(0);
  });
});
