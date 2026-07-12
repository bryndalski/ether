import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { buildSchema, introspectionFromSchema } from "graphql";
import { useGraphqlSchema } from "./useGraphqlSchema";
import { introspectionEnvelope } from "../lib/graphqlIntrospection";
import type { ResponseData, StoredRequest } from "../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// The env store only supplies activeEnvironmentId; a tiny stub keeps the test focused.
vi.mock("../state/useEnvStore", () => ({
  useEnvStore: (selector: (s: { activeEnvironmentId: string | null }) => unknown) =>
    selector({ activeEnvironmentId: "env-dev" }),
}));

const mockInvoke = vi.mocked(invoke);

const SDL = "type Query { hello: String user: User } type User { id: ID! name: String }";

function introspectionBody(): string {
  return JSON.stringify({ data: introspectionFromSchema(buildSchema(SDL)) });
}

function draft(): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "gql",
    method: "POST",
    url: "https://api.duotio.com/graphql",
    headers: [
      { name: "Authorization", value: "Bearer {{secret.TK}}", enabled: true },
    ],
    query_params: [],
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
    graphql: { operation_type: "query", query: "", variables_json: "{}" },
  };
}

function okResponse(body: string, status = 200): ResponseData {
  return {
    request_id: "r1",
    status,
    http_version: "HTTP/2",
    headers: [],
    body,
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: body.length,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 0 },
    effective_url: "https://api.duotio.com/graphql",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

beforeEach(() => mockInvoke.mockReset());
afterEach(() => vi.clearAllMocks());

describe("useGraphqlSchema", () => {
  it("hydrates from cache without a resolve_and_send (cache-first, offline)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "gql_schema_get") return Promise.resolve(introspectionBody());
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useGraphqlSchema(draft()));

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.schema).toBeTruthy();
    expect(result.current.typeCount).toBeGreaterThan(0);
    // no introspection network call — only the cache read
    expect(mockInvoke).not.toHaveBeenCalledWith("resolve_and_send", expect.anything());
  });

  it("refresh() introspects via resolve_and_send carrying the draft headers/auth", async () => {
    const d = draft();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "gql_schema_get") return Promise.resolve(null);
      if (cmd === "resolve_and_send") return Promise.resolve(okResponse(introspectionBody()));
      if (cmd === "gql_schema_put") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useGraphqlSchema(d));
    await waitFor(() => expect(result.current.state).toBe("no-schema"));

    await act(async () => {
      await result.current.refresh();
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "resolve_and_send");
    expect(call).toBeTruthy();
    const arg = call![1] as { request: StoredRequest; environmentId: string | null };
    expect(arg.request.method).toBe("POST");
    expect(arg.request.body.type).toBe("raw");
    expect((arg.request.body as { text: string }).text).toContain("IntrospectionQuery");
    // auth carried onto the introspection request
    expect(arg.request.headers).toEqual(d.headers);
    expect(arg.request.auth).toEqual(d.auth);
    expect(arg.environmentId).toBe("env-dev");
    expect(result.current.state).toBe("ready");
  });

  it("caches the raw introspection JSON via gql_schema_put after a refresh", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "gql_schema_get") return Promise.resolve(null);
      if (cmd === "resolve_and_send") return Promise.resolve(okResponse(introspectionBody()));
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useGraphqlSchema(draft()));
    await waitFor(() => expect(result.current.state).toBe("no-schema"));

    await act(async () => {
      await result.current.refresh();
    });

    const put = mockInvoke.mock.calls.find((c) => c[0] === "gql_schema_put");
    expect(put).toBeTruthy();
    const arg = put![1] as { endpointUrl: string; introspectionJson: string };
    expect(arg.endpointUrl).toBe("https://api.duotio.com/graphql");
    expect(arg.introspectionJson).toContain("__schema");
  });

  it("falls back to SDL when introspection is disabled and caches the sentinel", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "gql_schema_get") return Promise.resolve(null);
      if (cmd === "resolve_and_send") {
        return Promise.resolve(okResponse(JSON.stringify({ errors: [{ message: "disabled" }] })));
      }
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useGraphqlSchema(draft()));
    await waitFor(() => expect(result.current.state).toBe("no-schema"));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toBe("error");

    act(() => {
      result.current.applySdl("type Query { hello: String }");
    });
    expect(result.current.state).toBe("sdl-fallback");
    expect(result.current.schema).toBeTruthy();

    const put = mockInvoke.mock.calls.find(
      (c) => c[0] === "gql_schema_put" && String((c[1] as { introspectionJson: string }).introspectionJson).includes("__lok_sdl"),
    );
    expect(put).toBeTruthy();
  });
});

// The unused envelope import documents the canonical cache form for reviewers.
void introspectionEnvelope;
