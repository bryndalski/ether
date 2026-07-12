import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useSendRequest } from "./useSendRequest";
import type { ResponseData, StoredRequest } from "../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

function draft(): StoredRequest {
  return {
    id: "req-1",
    collection_id: "col-1",
    name: "List users",
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
  };
}

const okResponse: ResponseData = {
  request_id: "req-1",
  status: 200,
  http_version: "HTTP/2",
  headers: [],
  body: "{}",
  body_is_base64: false,
  body_truncated_at: null,
  size_download_bytes: 2,
  timings: { dns_ms: 1, connect_ms: 2, tls_ms: 3, ttfb_ms: 4, total_ms: 5 },
  effective_url: "https://api/x",
  redirect_chain: [],
  verbose_log: "",
  tls: null,
};

beforeEach(() => mockInvoke.mockReset());
afterEach(() => vi.clearAllMocks());

describe("useSendRequest", () => {
  it("calls resolve_and_send with the exact draft + active env id", async () => {
    mockInvoke.mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() => useSendRequest());
    const req = draft();

    await act(async () => {
      await result.current.send(req, "env-staging");
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("resolve_and_send", {
      request: req,
      environmentId: "env-staging",
    });
    // request payload deep-equals the draft (identity mapping)
    expect(mockInvoke.mock.calls[0][1]).toEqual({
      request: req,
      environmentId: "env-staging",
    });
    expect(result.current.sendState.phase).toBe("success");
    expect(result.current.sendState.response).toEqual(okResponse);
  });

  it("passes environmentId null when no env is active", async () => {
    mockInvoke.mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() => useSendRequest());

    await act(async () => {
      await result.current.send(draft(), null);
    });

    expect(mockInvoke).toHaveBeenCalledWith("resolve_and_send", {
      request: draft(),
      environmentId: null,
    });
  });

  it("enters error phase on a network failure without crashing", async () => {
    mockInvoke.mockRejectedValueOnce("could not resolve host");
    const { result } = renderHook(() => useSendRequest());

    await act(async () => {
      await result.current.send(draft(), null);
    });

    expect(result.current.sendState.phase).toBe("error");
    expect(result.current.sendState.error).toContain("could not resolve host");
  });

  it("surfaces the missing variable on an interpolation error", async () => {
    mockInvoke.mockRejectedValueOnce("unknown variable: host");
    const { result } = renderHook(() => useSendRequest());

    await act(async () => {
      await result.current.send(draft(), "env-1");
    });

    expect(result.current.sendState.phase).toBe("error");
    expect(result.current.sendState.error).toContain("host");
  });

  it("cancel invokes cancel_request with the in-flight request id", async () => {
    let resolveSend: (value: ResponseData) => void = () => {};
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "resolve_and_send") {
        return new Promise<ResponseData>((res) => {
          resolveSend = res;
        });
      }
      return Promise.resolve(true);
    });

    const { result } = renderHook(() => useSendRequest());
    act(() => {
      void result.current.send(draft(), null);
    });
    await waitFor(() => expect(result.current.sendState.phase).toBe("in-flight"));

    act(() => result.current.cancel());

    expect(result.current.sendState.phase).toBe("canceled");
    expect(mockInvoke).toHaveBeenCalledWith("cancel_request", {
      requestId: "req-1",
    });
    // resolving after cancel must not overwrite the canceled phase
    await act(async () => {
      resolveSend(okResponse);
    });
    expect(result.current.sendState.phase).toBe("canceled");
  });
});
