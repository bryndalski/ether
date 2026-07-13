import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useBenchmark } from "./useBenchmark";
import { benchStats } from "../lib/percentile";
import type { ResponseData, StoredRequest, Timings } from "../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

afterEach(() => {
  mockInvoke.mockReset();
});

function draft(): StoredRequest {
  return {
    id: "req-1",
    collection_id: "col-1",
    name: "bench me",
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
  };
}

function responseWith(totalMs: number): ResponseData {
  const timings: Timings = {
    dns_ms: 1,
    connect_ms: 2,
    tls_ms: 3,
    ttfb_ms: 4,
    total_ms: totalMs,
  };
  return {
    request_id: "x",
    status: 200,
    http_version: "HTTP/2",
    headers: [],
    body: "{}",
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 2,
    timings,
    effective_url: "https://api/x",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

describe("useBenchmark", () => {
  it("calls resolveAndSend N times with distinct ids and computes percentiles", async () => {
    const scriptedMs = Array.from({ length: 20 }, (_, index) => 90 + index);
    let callIndex = 0;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "resolve_and_send") {
        const ms = scriptedMs[callIndex];
        callIndex += 1;
        return Promise.resolve(responseWith(ms));
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useBenchmark());

    await act(async () => {
      await result.current.run(draft(), "env-1", {
        iterations: 20,
        concurrency: 1,
      });
    });

    const resolveCalls = mockInvoke.mock.calls.filter(
      ([command]) => command === "resolve_and_send",
    );
    expect(resolveCalls).toHaveLength(20);

    // Each probe carries a distinct synthetic id and the passed environmentId.
    const ids = resolveCalls.map(([, args]) => (args as { request: StoredRequest }).request.id);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toContain("req-1#bench-");
    for (const [, args] of resolveCalls) {
      expect((args as { environmentId: string }).environmentId).toBe("env-1");
    }

    expect(result.current.benchState.phase).toBe("done");
    expect(result.current.benchState.completed).toBe(20);
    const expected = benchStats(scriptedMs);
    expect(result.current.benchState.stats).toEqual(expected);
  });

  it("records a failed probe as ok:false and excludes it from stats", async () => {
    let callIndex = 0;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "resolve_and_send") {
        const current = callIndex;
        callIndex += 1;
        if (current === 1) return Promise.reject(new Error("network down"));
        return Promise.resolve(responseWith(100));
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useBenchmark());
    await act(async () => {
      await result.current.run(draft(), null, { iterations: 3, concurrency: 1 });
    });

    expect(result.current.benchState.completed).toBe(3);
    expect(result.current.benchState.samples.filter((s) => !s.ok)).toHaveLength(1);
    // Stats only over the 2 ok samples (both 100ms).
    expect(result.current.benchState.stats?.count).toBe(2);
    expect(result.current.benchState.stats?.avg).toBe(100);
  });

  it("cancel stops scheduling further probes and fires cancel_request", async () => {
    let started = 0;
    mockInvoke.mockImplementation((command: string) => {
      if (command === "resolve_and_send") {
        started += 1;
        // Never-resolving promise so the loop is stuck on the first probe.
        return new Promise<ResponseData>(() => {});
      }
      if (command === "cancel_request") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useBenchmark());
    act(() => {
      void result.current.run(draft(), null, { iterations: 10, concurrency: 1 });
    });

    await waitFor(() => expect(started).toBe(1));
    act(() => result.current.cancel());

    await waitFor(() =>
      expect(result.current.benchState.phase).toBe("canceled"),
    );
    // Only the first probe ever started; cancel_request was invoked once.
    expect(started).toBe(1);
    const cancelCalls = mockInvoke.mock.calls.filter(
      ([command]) => command === "cancel_request",
    );
    expect(cancelCalls).toHaveLength(1);
  });
});
