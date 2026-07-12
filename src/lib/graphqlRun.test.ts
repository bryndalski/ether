import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useSendRequest } from "../hooks/useSendRequest";
import { buildOperationRequest } from "./graphqlBody";
import type { ResponseData, StoredRequest } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

function draft(query: string, variables: string): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "op",
    method: "POST",
    url: "https://api.duotio.com/graphql",
    headers: [{ name: "Authorization", value: "Bearer {{secret.TK}}", enabled: true }],
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
    graphql: { operation_type: "query", query, variables_json: variables },
  };
}

const okResponse: ResponseData = {
  request_id: "r1",
  status: 200,
  http_version: "HTTP/2",
  headers: [],
  body: '{"data":{}}',
  body_is_base64: false,
  body_truncated_at: null,
  size_download_bytes: 12,
  timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 0 },
  effective_url: "https://api.duotio.com/graphql",
  redirect_chain: [],
  verbose_log: "",
  tls: null,
};

beforeEach(() => mockInvoke.mockReset());
afterEach(() => vi.clearAllMocks());

describe("Run -> resolve_and_send with {query,variables}", () => {
  it("sends the built operation body through resolve_and_send with the active env", async () => {
    mockInvoke.mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() => useSendRequest());

    const outgoing = buildOperationRequest(draft("query { me { id } }", '{"a":1}'));
    await act(async () => {
      await result.current.send(outgoing, "env-dev");
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "resolve_and_send");
    expect(call).toBeTruthy();
    const arg = call![1] as { request: StoredRequest; environmentId: string | null };
    expect(arg.environmentId).toBe("env-dev");
    const bodyText = (arg.request.body as { text: string }).text;
    const parsed = JSON.parse(bodyText);
    expect(parsed.query).toBe("query { me { id } }");
    expect(parsed.variables).toEqual({ a: 1 });
    expect(result.current.sendState.phase).toBe("success");
  });

  it("passes environmentId null when no env is active", async () => {
    mockInvoke.mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() => useSendRequest());
    const outgoing = buildOperationRequest(draft("query { x }", "{}"));

    await act(async () => {
      await result.current.send(outgoing, null);
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "resolve_and_send");
    expect((call![1] as { environmentId: string | null }).environmentId).toBeNull();
  });

  it("keeps {{env.x}}/{{secret.x}} tokens in the sent body (no FE interpolation)", async () => {
    mockInvoke.mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() => useSendRequest());
    const outgoing = buildOperationRequest(
      draft('query { user(id: "{{env.uid}}") { id } }', '{"t":"{{secret.API_TOKEN}}"}'),
    );

    await act(async () => {
      await result.current.send(outgoing, "env-dev");
    });

    const call = mockInvoke.mock.calls.find((c) => c[0] === "resolve_and_send");
    const bodyText = (call![1] as { request: StoredRequest }).request.body as { text: string };
    expect(bodyText.text).toContain("{{env.uid}}");
    expect(bodyText.text).toContain("{{secret.API_TOKEN}}");
  });
});
