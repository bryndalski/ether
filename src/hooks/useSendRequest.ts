// The request lifecycle state machine + IPC calls. Owns the in-flight request id
// (in a ref) so cancel() can reach cancel_request, and exposes a coarse phase so
// the Send button can animate: idle → interpolating → in-flight → success|error,
// or → canceled on user abort.

import { useCallback, useRef, useState } from "react";
import { cancelRequest, resolveAndSend } from "../lib/ipc";
import type { ResponseData, StoredRequest } from "../lib/types";

export type SendPhase =
  | "idle"
  | "interpolating"
  | "in-flight"
  | "success"
  | "error"
  | "canceled";

export interface SendState {
  phase: SendPhase;
  response: ResponseData | null;
  error: string | null;
}

export interface UseSendRequest {
  sendState: SendState;
  send: (draft: StoredRequest, environmentId: string | null) => Promise<void>;
  cancel: () => void;
}

const IDLE: SendState = { phase: "idle", response: null, error: null };

export function useSendRequest(): UseSendRequest {
  const [sendState, setSendState] = useState<SendState>(IDLE);
  const inFlightIdRef = useRef<string | null>(null);
  const canceledRef = useRef(false);

  const send = useCallback(
    async (draft: StoredRequest, environmentId: string | null) => {
      canceledRef.current = false;
      inFlightIdRef.current = draft.id;
      // Brief "interpolating" UI phase, then "in-flight" once the promise is
      // pending — interpolation itself happens inside resolve_and_send in Rust.
      setSendState({ phase: "interpolating", response: null, error: null });
      setSendState({ phase: "in-flight", response: null, error: null });
      try {
        const response = await resolveAndSend(draft, environmentId);
        if (canceledRef.current) return; // a cancel raced the resolve
        setSendState({ phase: "success", response, error: null });
      } catch (error) {
        if (canceledRef.current) return;
        setSendState({
          phase: "error",
          response: null,
          error: String(error),
        });
      } finally {
        inFlightIdRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    const requestId = inFlightIdRef.current;
    canceledRef.current = true;
    setSendState({ phase: "canceled", response: null, error: null });
    if (requestId) {
      // Fire-and-forget: a `false` means the request already finished.
      void cancelRequest(requestId).catch(() => {});
    }
  }, []);

  return { sendState, send, cancel };
}
