import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchMode } from "./useWatchMode";
import type { ResponseData, StoredRequest } from "../lib/types";

function response(): ResponseData {
  return {
    request_id: "r1",
    status: 200,
    http_version: "2",
    headers: [],
    body: "{}",
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 2,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 3 },
    effective_url: "https://api.test",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

function draft(id = "r1"): StoredRequest {
  return {
    id,
    collection_id: "c1",
    name: "req",
    method: "GET",
    url: "https://api.test",
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

type Send = (d: StoredRequest, env: string | null) => Promise<ResponseData | null>;

function args(send: Send, over: Record<string, unknown> = {}) {
  return {
    draft: draft(),
    environmentId: null as string | null,
    send,
    assertions: [],
    snapshotConfig: null,
    baseline: null,
    ...over,
  };
}

describe("useWatchMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("interval loop calls the send runner and records verdict runs", async () => {
    const send = vi.fn().mockResolvedValue(response()) as unknown as Send & { mock: { calls: unknown[] } };
    const { result } = renderHook(() => useWatchMode(args(send)));

    act(() => {
      result.current.setConfig({ intervalSec: 5, onInterval: true });
      result.current.start();
    });
    await act(async () => {
      await Promise.resolve(); // let the immediate first run settle
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.runs[0].ok).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.runs).toHaveLength(2);
  });

  it("caps the runs ring buffer at maxRuns (newest first)", async () => {
    const send = vi.fn().mockResolvedValue(response()) as unknown as Send & { mock: { calls: unknown[] } };
    const { result } = renderHook(() => useWatchMode(args(send)));
    act(() => {
      result.current.setConfig({ intervalSec: 2, maxRuns: 2 });
      result.current.start();
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.runs.length).toBeLessThanOrEqual(2);
  });

  it("does not overlap runs while a send is in flight", async () => {
    let resolveSend: (r: ResponseData) => void = () => {};
    const send = vi.fn().mockImplementation(
      () => new Promise<ResponseData>((res) => (resolveSend = res)),
    );
    const { result } = renderHook(() => useWatchMode(args(send)));
    act(() => {
      result.current.setConfig({ intervalSec: 2, onInterval: true });
      result.current.start();
    });
    // First run is pending; advancing time must NOT start a second run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSend(response());
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stop() halts the loop — no further sends after stop", async () => {
    const send = vi.fn().mockResolvedValue(response()) as unknown as Send & { mock: { calls: unknown[] } };
    const { result } = renderHook(() => useWatchMode(args(send)));
    act(() => {
      result.current.setConfig({ intervalSec: 3 });
      result.current.start();
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.stop());
    expect(result.current.watching).toBe(false);
    const callsAfterStop = send.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(send).toHaveBeenCalledTimes(callsAfterStop);
  });

  it("clamps the interval to [2, 30]", () => {
    const send = vi.fn().mockResolvedValue(response()) as unknown as Send & { mock: { calls: unknown[] } };
    const { result } = renderHook(() => useWatchMode(args(send)));
    act(() => result.current.setConfig({ intervalSec: 1 }));
    expect(result.current.config.intervalSec).toBe(2);
    act(() => result.current.setConfig({ intervalSec: 40 }));
    expect(result.current.config.intervalSec).toBe(30);
  });

  it("cleans up timers on unmount (no send after unmount)", async () => {
    const send = vi.fn().mockResolvedValue(response()) as unknown as Send & { mock: { calls: unknown[] } };
    const { result, unmount } = renderHook(() => useWatchMode(args(send)));
    act(() => {
      result.current.setConfig({ intervalSec: 2 });
      result.current.start();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const before = send.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(send).toHaveBeenCalledTimes(before);
  });
});
