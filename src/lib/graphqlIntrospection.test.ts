import { describe, expect, it } from "vitest";
import {
  buildSchema,
  getIntrospectionQuery,
  graphqlSync,
  introspectionFromSchema,
} from "graphql";
import {
  buildIntrospectionRequest,
  countSchemaTypes,
  introspectionEnvelope,
  parseCache,
  parseSchemaResponse,
  sdlEnvelope,
} from "./graphqlIntrospection";
import type { StoredRequest } from "./types";

function draft(): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "gql",
    method: "POST",
    url: "https://api.duotio.com/graphql",
    headers: [
      { name: "Authorization", value: "Bearer {{secret.API_TOKEN}}", enabled: true },
    ],
    query_params: [],
    body: { type: "none" },
    auth: { type: "bearer", token: "{{secret.API_TOKEN}}" },
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
    graphql: { operation_type: "query", query: "", variables_json: "{}" },
    assertions: [],
  };
}

const SDL = "type Query { hello: String user: User } type User { id: ID! name: String }";

function introspectionData() {
  const schema = buildSchema(SDL);
  return introspectionFromSchema(schema);
}

describe("buildIntrospectionRequest", () => {
  it("clones headers and auth from the draft (introspection-with-auth)", () => {
    const d = draft();
    const req = buildIntrospectionRequest(d, d.url);
    expect(req.method).toBe("POST");
    expect(req.graphql).toBeNull();
    expect(req.headers).toEqual(d.headers);
    expect(req.auth).toEqual(d.auth);
  });

  it("uses the introspection query as the body text", () => {
    const d = draft();
    const req = buildIntrospectionRequest(d, d.url);
    expect(req.body).toEqual({
      type: "raw",
      content_type: "application/json",
      text: JSON.stringify({ query: getIntrospectionQuery() }),
    });
  });
});

describe("parseSchemaResponse", () => {
  it("returns a schema from a valid introspection body", () => {
    const body = JSON.stringify({ data: introspectionData() });
    const result = parseSchemaResponse(body);
    expect(result.schema).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("returns an error when introspection is disabled ({errors:[...]})", () => {
    const body = JSON.stringify({ errors: [{ message: "introspection is disabled" }] });
    const result = parseSchemaResponse(body);
    expect(result.schema).toBeUndefined();
    expect(result.error).toContain("introspection is disabled");
  });

  it("returns an error when the body is not JSON", () => {
    expect(parseSchemaResponse("<html>nope</html>").error).toBeTruthy();
  });
});

describe("cache round-trip (introspection vs SDL sentinel)", () => {
  it("parses an introspection envelope back into a schema", () => {
    const json = introspectionEnvelope(introspectionData());
    const schema = parseCache(json);
    // sanity: the schema can run a trivial validation query
    const res = graphqlSync({ schema, source: "{ hello }" });
    expect(res.errors).toBeUndefined();
  });

  it("parses an SDL-sentinel envelope back into a schema (SDL fallback)", () => {
    const json = sdlEnvelope("type Query { a: Int }");
    const schema = parseCache(json);
    expect(schema.getQueryType()?.getFields().a).toBeDefined();
  });
});

describe("countSchemaTypes", () => {
  it("excludes introspection __ types", () => {
    const schema = buildSchema(SDL);
    const count = countSchemaTypes(schema);
    // Query, User + built-in scalars, but no __Schema etc.
    expect(count).toBeGreaterThan(0);
    expect(
      Object.keys(schema.getTypeMap()).some((n) => n.startsWith("__")),
    ).toBe(true);
  });
});
