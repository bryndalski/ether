import { describe, expect, it } from "vitest";
import { isRequestDirty } from "./dirty";
import type { StoredRequest } from "./types";

function make(): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "req",
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
    assertions: [],
  };
}

describe("isRequestDirty", () => {
  it("is false for identical draft and persisted", () => {
    expect(isRequestDirty(make(), make())).toBe(false);
  });

  it("is true when any field diverges", () => {
    expect(isRequestDirty({ ...make(), url: "https://api/y" }, make())).toBe(
      true,
    );
    expect(isRequestDirty({ ...make(), method: "POST" }, make())).toBe(true);
  });

  it("is true when there is no persisted counterpart", () => {
    expect(isRequestDirty(make(), null)).toBe(true);
  });
});
