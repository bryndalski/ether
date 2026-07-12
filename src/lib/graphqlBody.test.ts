import { describe, expect, it } from "vitest";
import { buildGraphqlBody, buildOperationRequest } from "./graphqlBody";
import type { StoredRequest } from "./types";

function gqlDraft(query: string, variables: string): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "op",
    method: "GET",
    url: "https://api/graphql",
    headers: [{ name: "Authorization", value: "Bearer {{secret.TK}}", enabled: true }],
    query_params: [{ name: "stale", value: "1", enabled: true }],
    body: { type: "none" },
    auth: { type: "bearer", token: "{{secret.TK}}" },
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
    graphql: { operation_type: "query", query, variables_json: variables },
  };
}

describe("buildGraphqlBody", () => {
  it("produces a {query,variables} envelope with JSON-escaped query", () => {
    const body = buildGraphqlBody('query { user { id } }', '{"id":"1"}');
    const parsed = JSON.parse(body);
    expect(parsed.query).toBe("query { user { id } }");
    expect(parsed.variables).toEqual({ id: "1" });
  });

  it("preserves {{env.x}} tokens verbatim inside variables (no interpolation)", () => {
    const body = buildGraphqlBody(
      'query { me { id } }',
      '{"id":"{{env.testUserId}}","t":"{{secret.API_TOKEN}}"}',
    );
    expect(body).toContain("{{env.testUserId}}");
    expect(body).toContain("{{secret.API_TOKEN}}");
  });

  it("preserves {{env.x}} tokens inside the query string", () => {
    const body = buildGraphqlBody(
      'query { user(id: "{{env.uid}}") { name } }',
      "{}",
    );
    expect(body).toContain("{{env.uid}}");
  });

  it("defaults blank/whitespace variables to an empty object", () => {
    expect(buildGraphqlBody("query { x }", "")).toContain('"variables":{}');
    expect(buildGraphqlBody("query { x }", "   ")).toContain('"variables":{}');
  });
});

describe("buildOperationRequest", () => {
  it("becomes a POST with a raw {query,variables} JSON body", () => {
    const req = buildOperationRequest(gqlDraft("query { me { id } }", '{"a":1}'));
    expect(req.method).toBe("POST");
    expect(req.query_params).toEqual([]);
    expect(req.body.type).toBe("raw");
    const parsed = JSON.parse((req.body as { text: string }).text);
    expect(parsed.query).toBe("query { me { id } }");
    expect(parsed.variables).toEqual({ a: 1 });
  });

  it("keeps url/headers/auth untouched (same env/secret/SigV4 layer)", () => {
    const d = gqlDraft("query { x }", "{}");
    const req = buildOperationRequest(d);
    expect(req.url).toBe(d.url);
    expect(req.headers).toEqual(d.headers);
    expect(req.auth).toEqual(d.auth);
  });

  it("preserves {{env.x}}/{{secret.x}} tokens into the raw body (differentiator)", () => {
    const req = buildOperationRequest(
      gqlDraft('query { user(id: "{{env.uid}}") { name } }', '{"t":"{{secret.API_TOKEN}}"}'),
    );
    const text = (req.body as { text: string }).text;
    expect(text).toContain("{{env.uid}}");
    expect(text).toContain("{{secret.API_TOKEN}}");
  });

  it("returns a REST draft unchanged", () => {
    const rest = { ...gqlDraft("", "{}"), graphql: null };
    expect(buildOperationRequest(rest)).toBe(rest);
  });
});
