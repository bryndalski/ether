// The long-lived sibling of useSendRequest: owns one active subscription id, a
// single global listen("gql-sub") subscription, the newest-first event buffer,
// the connection status, and cleanup. One listener serves every subscription;
// events route by their `id` so remounts and concurrent subs stay correct.

import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { subscriptionStart, subscriptionStop } from "../lib/ipc";
import {
  STREAM_BUFFER_CAP,
  SUB_CHANNEL,
  type ConnStatus,
  type SubEvent,
} from "../lib/subscriptions";
import type { StoredRequest } from "../lib/types";

export type SubConnState = "idle" | ConnStatus;

export interface StreamEvent {
  seq: number;
  ts: string;
  kind: "next" | "error";
  payload: unknown;
}

export interface UseSubscription {
  connState: SubConnState;
  events: StreamEvent[]; // newest-first
  eventCount: number; // events currently in view
  error: string | null;
  subscribe: (
    draft: StoredRequest,
    environmentId: string | null,
    connectionPayload?: unknown,
  ) => Promise<void>;
  unsubscribe: () => void;
  clear: () => void;
}

/** Push newest-first, capping the buffer so a chatty stream cannot grow memory
 *  without bound. The visible counter tracks buffer length, not total received. */
function pushCapped(buffer: StreamEvent[], event: StreamEvent): StreamEvent[] {
  const next = [event, ...buffer];
  return next.length > STREAM_BUFFER_CAP ? next.slice(0, STREAM_BUFFER_CAP) : next;
}

export function useSubscription(): UseSubscription {
  const [connState, setConnState] = useState<SubConnState>("idle");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  // One global listener for the lifetime of the hook. It filters by the active
  // id, so it serves whichever subscription is live without re-attaching.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    void listen<SubEvent>(SUB_CHANNEL, ({ payload }) => {
      if (payload.id !== activeIdRef.current) return; // route by id

      if (payload.kind === "status") {
        const status = payload.status ?? "idle";
        setConnState(status);
        if (status === "error") setError(payload.message ?? "subscription error");
        return;
      }
      if (payload.kind === "complete") {
        setConnState("closed");
        activeIdRef.current = null;
        return;
      }
      // next / error → prepend to the buffer, newest-first. (status/complete
      // returned above, so kind is narrowed to the two data-bearing kinds.)
      const kind: StreamEvent["kind"] = payload.kind === "error" ? "error" : "next";
      setEvents((buffer) =>
        pushCapped(buffer, {
          seq: payload.seq,
          ts: payload.ts,
          kind,
          payload: payload.data,
        }),
      );
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      // The event channel is a best-effort side channel: outside a Tauri webview
      // (e.g. a unit test that only mocks the core IPC) `listen` may reject —
      // never surface that as an unhandled rejection.
      .catch(() => {});

    return () => {
      disposed = true;
      if (unlisten) unlisten();
      const activeId = activeIdRef.current;
      if (activeId) void subscriptionStop(activeId).catch(() => {});
    };
  }, []);

  const subscribe = useCallback(
    async (
      draft: StoredRequest,
      environmentId: string | null,
      connectionPayload?: unknown,
    ) => {
      if (draft.graphql?.operation_type !== "subscription") return;
      if (draft.graphql.query.trim() === "") return;

      // Tear down any live subscription before starting a new one.
      const previous = activeIdRef.current;
      if (previous) void subscriptionStop(previous).catch(() => {});

      setEvents([]);
      setError(null);
      setConnState("connecting");
      try {
        const id = await subscriptionStart(draft, environmentId, connectionPayload);
        activeIdRef.current = id;
      } catch (caught) {
        setConnState("error");
        setError(String(caught));
      }
    },
    [],
  );

  const unsubscribe = useCallback(() => {
    const activeId = activeIdRef.current;
    activeIdRef.current = null;
    setConnState("closed");
    if (activeId) void subscriptionStop(activeId).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    connState,
    events,
    eventCount: events.length,
    error,
    subscribe,
    unsubscribe,
    clear,
  };
}
