import { describe, expect, it } from "vitest";
import { validateArtifact } from "./validate";
import { defaultAssertion } from "../assertionDefaults";

describe("validateArtifact — assertions", () => {
  it("keeps legal variants and drops off-vocabulary items", () => {
    const raw = {
      assertions: [
        { type: "status_equals", expected: 200, enabled: true },
        { type: "bogus" },
        { type: "body_contains", substring: "ok" },
      ],
    };
    const result = validateArtifact("generate-assertions", raw);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "assertions") throw new Error("expected assertions");
    expect(result.assertions).toHaveLength(2);
  });

  it("a surviving status_equals deep-equals the default template plus the model's expected", () => {
    const raw = { assertions: [{ type: "status_equals", expected: 201 }] };
    const result = validateArtifact("generate-assertions", raw);
    if (!result.ok || result.kind !== "assertions") throw new Error("expected assertions");
    expect(result.assertions[0]).toEqual({
      ...defaultAssertion("status_equals"),
      expected: 201,
      enabled: true,
    });
  });
});

describe("validateArtifact — request", () => {
  it("narrows method/url/headers into a StoredRequest subset (no id from the model)", () => {
    const raw = {
      id: "attacker-supplied-id",
      method: "post",
      url: "https://{{env.host}}/users",
      headers: [{ name: "Accept", value: "application/json" }],
      body_text: '{"a":1}',
    };
    const result = validateArtifact("nl-to-request", raw);
    if (!result.ok || result.kind !== "request") throw new Error("expected request");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://{{env.host}}/users");
    expect(result.request.headers).toEqual([
      { name: "Accept", value: "application/json", enabled: true },
    ]);
    // The model can't smuggle an id/collection_id — the artifact has neither.
    expect("id" in result.request).toBe(false);
  });

  it("returns a typed error when method/url are missing (no store write)", () => {
    const result = validateArtifact("nl-to-request", { url: "x" });
    expect(result.ok).toBe(false);
  });
});

describe("validateArtifact — graphql & markdown", () => {
  it("folds a query into a GraphqlMeta subset", () => {
    const result = validateArtifact("nl-to-graphql", { query: "{ me { id } }" });
    if (!result.ok || result.kind !== "graphql") throw new Error("expected graphql");
    expect(result.graphql.query).toBe("{ me { id } }");
    expect(result.graphql.variablesJson).toBe("{}");
  });

  it("markdown actions require a non-empty markdown field", () => {
    expect(validateArtifact("explain-error", { markdown: "# Diagnosis" }).ok).toBe(true);
    expect(validateArtifact("document-request", { markdown: "" }).ok).toBe(false);
  });

  it("a non-object completion is a typed error, never a throw", () => {
    expect(validateArtifact("explain-error", "not json").ok).toBe(false);
    expect(validateArtifact("generate-assertions", null).ok).toBe(false);
  });
});
