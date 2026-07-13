import { describe, expect, it, vi } from "vitest";
import { applyArtifact, type MaterializeDeps } from "./materialize";
import type { StoredRequest } from "../types";
import { translate } from "../../i18n";

const baseRequest: StoredRequest = {
  id: "req-1",
  collection_id: "col-1",
  name: "Get user",
  method: "GET",
  url: "https://api/x",
  headers: [],
  query_params: [],
  body: { type: "none" },
  auth: { type: "none" },
  options: {
    follow_redirects: true,
    max_redirects: 10,
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
};

function makeDeps(active: StoredRequest | null): {
  deps: MaterializeDeps;
  saveRequest: ReturnType<typeof vi.fn>;
} {
  const saveRequest = vi.fn();
  return {
    saveRequest,
    deps: {
      collections: { activeRequest: () => active, saveRequest },
      show: vi.fn(),
      translate: (key, vars) => translate("en", key, vars),
      evalMs: 12,
    },
  };
}

describe("applyArtifact", () => {
  it("appends generated assertions onto the active request (keeps id/collection_id)", () => {
    const { deps, saveRequest } = makeDeps(baseRequest);
    applyArtifact(
      { ok: true, kind: "assertions", assertions: [{ type: "status_equals", expected: 200, enabled: true }] },
      deps,
    );
    const saved = saveRequest.mock.calls[0][0] as StoredRequest;
    expect(saved.id).toBe("req-1");
    expect(saved.collection_id).toBe("col-1");
    expect(saved.assertions).toHaveLength(1);
  });

  it("materializes a request artifact (method/url/headers), never taking an id from the model", () => {
    const { deps, saveRequest } = makeDeps(baseRequest);
    applyArtifact(
      {
        ok: true,
        kind: "request",
        request: {
          method: "POST",
          url: "https://api/y",
          headers: [{ name: "Accept", value: "application/json", enabled: true }],
          bodyText: '{"a":1}',
        },
      },
      deps,
    );
    const saved = saveRequest.mock.calls[0][0] as StoredRequest;
    expect(saved.method).toBe("POST");
    expect(saved.url).toBe("https://api/y");
    expect(saved.id).toBe("req-1"); // kept from the active request, not the model
    expect(saved.body).toEqual({ type: "raw", content_type: "application/json", text: '{"a":1}' });
  });

  it("writes a GraphQL query into GraphqlMeta", () => {
    const { deps, saveRequest } = makeDeps(baseRequest);
    applyArtifact(
      { ok: true, kind: "graphql", graphql: { query: "{ me { id } }", variablesJson: "{}" } },
      deps,
    );
    const saved = saveRequest.mock.calls[0][0] as StoredRequest;
    expect(saved.graphql?.query).toBe("{ me { id } }");
  });

  it("returns diagnosis markdown for the pane and writes docs_md", () => {
    const { deps, saveRequest } = makeDeps(baseRequest);
    const md = applyArtifact({ ok: true, kind: "markdown", markdown: "# Diagnosis" }, deps);
    expect(md).toBe("# Diagnosis");
    const saved = saveRequest.mock.calls[0][0] as StoredRequest;
    expect(saved.docs_md).toBe("# Diagnosis");
  });

  it("no active request → no store write for assertions/request", () => {
    const { deps, saveRequest } = makeDeps(null);
    applyArtifact({ ok: true, kind: "assertions", assertions: [] }, deps);
    expect(saveRequest).not.toHaveBeenCalled();
  });
});
