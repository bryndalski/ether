import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useScriptRunner } from "./useScriptRunner";
import type { ScriptOutcome } from "../../../lib/scripts";
import type { ResponseData, StoredRequest } from "../../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

afterEach(() => mockInvoke.mockReset());

function request(): StoredRequest {
  return {
    id: "r-1",
    collection_id: "c-1",
    name: "r",
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
    pre_script: null,
    post_script: null,
  };
}

function response(): ResponseData {
  return {
    request_id: "r-1",
    status: 200,
    http_version: "HTTP/1.1",
    headers: [],
    body: "{}",
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 2,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 1 },
    effective_url: "https://api/x",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

const okOutcome: ScriptOutcome = {
  ok: true,
  logs: ["ran"],
  env_set: [["id", "1"]],
  tests: [{ name: "ok", passed: true }],
};

describe("useScriptRunner", () => {
  it("runs a pre-script via run_pre_script and stores the outcome", async () => {
    mockInvoke.mockResolvedValueOnce(okOutcome);
    const { result } = renderHook(() => useScriptRunner());
    await act(async () => {
      await result.current.runPre(request(), null, "lok.env.set('id','1');");
    });
    expect(mockInvoke).toHaveBeenCalledWith("run_pre_script", {
      request: expect.any(Object),
      environmentId: null,
      script: "lok.env.set('id','1');",
    });
    await waitFor(() => expect(result.current.pre).toEqual(okOutcome));
  });

  it("runs a post-script via run_post_script and stores the outcome", async () => {
    mockInvoke.mockResolvedValueOnce(okOutcome);
    const { result } = renderHook(() => useScriptRunner());
    await act(async () => {
      await result.current.runPost(response(), "lok.expect('ok', true);", {});
    });
    expect(mockInvoke).toHaveBeenCalledWith("run_post_script", {
      response: expect.any(Object),
      script: "lok.expect('ok', true);",
      variables: {},
    });
    await waitFor(() => expect(result.current.post).toEqual(okOutcome));
  });

  it("wraps an IPC rejection as a failed outcome", async () => {
    mockInvoke.mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useScriptRunner());
    await act(async () => {
      await result.current.runPre(request(), null, "bad");
    });
    await waitFor(() => expect(result.current.pre?.ok).toBe(false));
    expect(result.current.pre?.error).toContain("boom");
  });
});
