import { describe, expect, it } from "vitest";
import {
  hasRedactedSecrets,
  importSpecOntoDraft,
  REDACTED,
  redactedFields,
} from "./replay";
import type { Auth, KeyValue, RequestSpec, StoredRequest } from "./types";

const kv = (name: string, value: string): KeyValue => ({
  name,
  value,
  enabled: true,
});

const baseOptions: RequestSpec["options"] = {
  follow_redirects: true,
  max_redirects: 10,
  timeout_ms: 30_000,
  insecure: false,
  ca_bundle_path: null,
  compressed: true,
  cookie_jar: null,
};

function spec(overrides: Partial<RequestSpec> = {}): RequestSpec {
  return {
    id: "r1",
    method: "GET",
    url: "https://api.example.com/v1",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: baseOptions,
    ...overrides,
  };
}

describe("redactedFields", () => {
  it("detects a redacted bearer token", () => {
    const auth: Auth = { type: "bearer", token: REDACTED };
    expect(redactedFields(spec({ auth }))).toEqual([
      { kind: "auth-bearer", name: "Authorization (Bearer)" },
    ]);
  });

  it("detects a redacted basic password (username kept intact)", () => {
    const auth: Auth = { type: "basic", username: "alice", password: REDACTED };
    const holes = redactedFields(spec({ auth }));
    expect(holes).toEqual([{ kind: "auth-basic", name: "Basic password" }]);
  });

  it("detects a redacted api-key value and names it", () => {
    const auth: Auth = {
      type: "api_key",
      name: "X-Api-Key",
      value: REDACTED,
      placement: "header",
    };
    expect(redactedFields(spec({ auth }))).toEqual([
      { kind: "auth-api-key", name: "X-Api-Key" },
    ]);
  });

  it("detects redacted secret headers and query params", () => {
    const holes = redactedFields(
      spec({
        headers: [kv("Authorization", REDACTED), kv("Accept", "application/json")],
        query_params: [kv("token", REDACTED), kv("page", "1")],
      }),
    );
    expect(holes).toEqual([
      { kind: "header", name: "Authorization" },
      { kind: "query", name: "token" },
    ]);
  });

  it("ignores non-secret fields and never flags the body", () => {
    const holes = redactedFields(
      spec({
        headers: [kv("Accept", "application/json")],
        body: { type: "raw", content_type: "application/json", text: REDACTED },
      }),
    );
    expect(holes).toEqual([]);
  });

  it("finds no holes for sig_v4 (no secret in the spec)", () => {
    const auth: Auth = {
      type: "sig_v4",
      profile: "default",
      region: "eu-central-1",
      service: "execute-api",
    };
    expect(redactedFields(spec({ auth }))).toEqual([]);
  });
});

describe("hasRedactedSecrets — the Send guard", () => {
  it("is true while any ••• remains in a secret field", () => {
    expect(
      hasRedactedSecrets(spec({ auth: { type: "bearer", token: REDACTED } })),
    ).toBe(true);
    expect(
      hasRedactedSecrets(spec({ headers: [kv("Authorization", REDACTED)] })),
    ).toBe(true);
  });

  it("is false when nothing is redacted", () => {
    expect(hasRedactedSecrets(spec())).toBe(false);
    expect(
      hasRedactedSecrets(
        spec({ auth: { type: "bearer", token: "{{secret.API_TOKEN}}" } }),
      ),
    ).toBe(false);
  });
});

describe("importSpecOntoDraft", () => {
  it("copies request fields from the spec but keeps draft identity fields", () => {
    const draft: StoredRequest = {
      id: "draft-id",
      collection_id: "col-1",
      name: "My request",
      method: "GET",
      url: "https://old",
      headers: [],
      query_params: [],
      body: { type: "none" },
      auth: { type: "none" },
      options: baseOptions,
      sort_order: 7,
      docs_md: "notes",
      graphql: null,
      assertions: [],
    };
    const imported = importSpecOntoDraft(
      draft,
      spec({
        method: "POST",
        url: "https://new",
        headers: [kv("Accept", "application/json")],
      }),
    );
    // identity kept
    expect(imported.id).toBe("draft-id");
    expect(imported.collection_id).toBe("col-1");
    expect(imported.name).toBe("My request");
    expect(imported.sort_order).toBe(7);
    expect(imported.docs_md).toBe("notes");
    // request structure taken from the spec
    expect(imported.method).toBe("POST");
    expect(imported.url).toBe("https://new");
    expect(imported.headers).toHaveLength(1);
  });
});
