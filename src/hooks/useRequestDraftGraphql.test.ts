import { describe, expect, it } from "vitest";
import { draftReducer, EMPTY_GQL } from "./useRequestDraft";
import type { StoredRequest } from "../lib/types";

function restDraft(): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "req",
    method: "GET",
    url: "https://api.duotio.com/graphql",
    headers: [{ name: "Authorization", value: "Bearer x", enabled: true }],
    query_params: [{ name: "q", value: "1", enabled: true }],
    body: { type: "none" },
    auth: { type: "bearer", token: "x" },
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
  };
}

describe("REST <-> GraphQL switch (draftReducer)", () => {
  it("REST -> GraphQL sets graphql, forces POST, clears params, keeps url/headers/auth", () => {
    const rest = restDraft();
    const next = draftReducer(rest, { kind: "setGraphql", graphql: {} });
    expect(next.graphql).toEqual(EMPTY_GQL);
    expect(next.method).toBe("POST");
    expect(next.query_params).toEqual([]);
    // url/headers/auth carried over so introspection works immediately
    expect(next.url).toBe(rest.url);
    expect(next.headers).toEqual(rest.headers);
    expect(next.auth).toEqual(rest.auth);
  });

  it("setGraphql shallow-merges onto existing meta", () => {
    let d = draftReducer(restDraft(), { kind: "setGraphql", graphql: {} });
    d = draftReducer(d, { kind: "setGraphql", graphql: { query: "query { me }" } });
    d = draftReducer(d, { kind: "setGraphql", graphql: { operation_type: "mutation" } });
    expect(d.graphql).toEqual({
      operation_type: "mutation",
      query: "query { me }",
      variables_json: "{}",
    });
  });

  it("GraphQL -> REST nulls the discriminator but keeps url/headers/auth", () => {
    const gql = draftReducer(restDraft(), {
      kind: "setGraphql",
      graphql: { query: "query { me }" },
    });
    const rest = draftReducer(gql, { kind: "clearGraphql" });
    expect(rest.graphql).toBeNull();
    expect(rest.url).toBe(gql.url);
    expect(rest.headers).toEqual(gql.headers);
    expect(rest.auth).toEqual(gql.auth);
  });
});
