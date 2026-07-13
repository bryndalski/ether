import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { subscriptionStart, subscriptionStop } from "../lib/ipc";
import { useSubscription } from "./useSubscription";
import { STREAM_BUFFER_CAP, type SubEvent } from "../lib/subscriptions";
import type { StoredRequest } from "../lib/types";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../lib/ipc", () => ({
  subscriptionStart: vi.fn(),
  subscriptionStop: vi.fn(),
}));

const mockListen = vi.mocked(listen);
const mockStart = vi.mocked(subscriptionStart);
const mockStop = vi.mocked(subscriptionStop);

// Capture the handler the hook registers so the test can push events at it, and
// hand back a spy unlisten so cleanup is observable.
type Handler = (event: { payload: SubEvent }) => void;
let capturedHandler: Handler | null = null;
const unlistenSpy = vi.fn();

function emit(event: SubEvent) {
  capturedHandler?.({ payload: event });
}

function subDraft(query = "subscription { tick }"): StoredRequest {
  return {
    id: "req-sub",
    collection_id: "c",
    name: "ticks",
    method: "POST",
    url: "https://api/graphql",
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
    graphql: { operation_type: "subscription", query, variables_json: "{}" },
    assertions: [],
  };
}

function statusEvent(status: SubEvent["status"], seq = 0): SubEvent {
  return { id: "sub-1", seq, kind: "status", ts: "2026-07-13T00:00:00Z", status };
}

function nextEvent(seq: number, data: unknown, id = "sub-1"): SubEvent {
  return { id, seq, kind: "next", ts: "2026-07-13T00:00:00Z", data };
}

beforeEach(() => {
  capturedHandler = null;
  unlistenSpy.mockReset();
  mockListen.mockReset();
  mockStart.mockReset();
  mockStop.mockReset();
  mockListen.mockImplementation((_name: string, handler: unknown) => {
    capturedHandler = handler as Handler;
    return Promise.resolve(unlistenSpy);
  });
  mockStart.mockResolvedValue("sub-1");
  mockStop.mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

/** subscribe() and wait until the listener + active id are wired. */
async function subscribeAndWait(result: { current: ReturnType<typeof useSubscription> }) {
  await act(async () => {
    await result.current.subscribe(subDraft(), "env-1");
  });
  await waitFor(() => expect(capturedHandler).not.toBeNull());
}

describe("useSubscription", () => {
  it("appends a next event newest-first and counts it", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() => emit(nextEvent(0, { data: { tick: 1 } })));
    act(() => emit(nextEvent(1, { data: { tick: 2 } })));

    expect(result.current.eventCount).toBe(2);
    // newest-first: the last emitted (seq 1) is at the top
    expect(result.current.events[0].seq).toBe(1);
    expect(result.current.events[1].seq).toBe(0);
  });

  it("routes by id — an event for a different subscription is ignored", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() => emit(nextEvent(0, { tick: 1 }, "OTHER-ID")));

    expect(result.current.eventCount).toBe(0);
  });

  it("maps status frames to connState (and sets error on error status)", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() => emit(statusEvent("open")));
    expect(result.current.connState).toBe("open");

    act(() =>
      emit({ ...statusEvent("error", 1), message: "handshake timeout" }),
    );
    expect(result.current.connState).toBe("error");
    expect(result.current.error).toBe("handshake timeout");
  });

  it("closes on a complete frame and clears the active id", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() =>
      emit({ id: "sub-1", seq: 0, kind: "complete", ts: "2026-07-13T00:00:00Z" }),
    );
    expect(result.current.connState).toBe("closed");

    // active id cleared → a subsequent stray next is ignored
    act(() => emit(nextEvent(1, { tick: 9 })));
    expect(result.current.eventCount).toBe(0);
  });

  it("unsubscribe calls subscription_stop with the active id and closes", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() => result.current.unsubscribe());

    expect(mockStop).toHaveBeenCalledWith("sub-1");
    expect(result.current.connState).toBe("closed");
  });

  it("cleans up on unmount: unlisten and stop the live subscription", async () => {
    const { result, unmount } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    unmount();

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledWith("sub-1");
  });

  it("tears down a prior subscription before starting a new one", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    mockStart.mockResolvedValueOnce("sub-2");
    await act(async () => {
      await result.current.subscribe(subDraft(), "env-1");
    });

    // the first id was stopped before the second started
    expect(mockStop).toHaveBeenCalledWith("sub-1");
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("clear empties the buffer but leaves connState untouched", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);
    act(() => emit(statusEvent("open")));
    act(() => emit(nextEvent(1, { tick: 1 })));
    expect(result.current.eventCount).toBe(1);

    act(() => result.current.clear());

    expect(result.current.eventCount).toBe(0);
    expect(result.current.connState).toBe("open");
  });

  it("caps the buffer at STREAM_BUFFER_CAP, dropping the oldest", async () => {
    const { result } = renderHook(() => useSubscription());
    await subscribeAndWait(result);

    act(() => {
      for (let seq = 0; seq < STREAM_BUFFER_CAP + 10; seq += 1) {
        emit(nextEvent(seq, { tick: seq }));
      }
    });

    expect(result.current.eventCount).toBe(STREAM_BUFFER_CAP);
    // newest-first: top is the last emitted, and the oldest were dropped
    expect(result.current.events[0].seq).toBe(STREAM_BUFFER_CAP + 9);
    expect(result.current.events[STREAM_BUFFER_CAP - 1].seq).toBe(10);
  });

  it("does not subscribe for a non-subscription operation", async () => {
    const { result } = renderHook(() => useSubscription());
    const queryDraft = subDraft();
    queryDraft.graphql = {
      operation_type: "query",
      query: "query { me { id } }",
      variables_json: "{}",
    };

    await act(async () => {
      await result.current.subscribe(queryDraft, "env-1");
    });

    expect(mockStart).not.toHaveBeenCalled();
  });
});
