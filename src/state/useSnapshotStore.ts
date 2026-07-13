// The saved-baseline store for the active request (one snapshot per request).
// Owns NO compare logic — SnapshotView computes compareSnapshot from `record`
// plus the live response. Mirrors useHistoryStore's thin async style.

import { create } from "zustand";
import { snapshotDelete, snapshotGet, snapshotPut } from "../lib/ipc";
import type { ResponseData, ScrubConfig, SnapshotRecord } from "../lib/types";

interface SnapshotState {
  record: SnapshotRecord | null;
  loading: boolean;
  error: string | null;

  load: (requestId: string) => Promise<void>;
  save: (
    requestId: string,
    response: ResponseData,
    scrubConfig: ScrubConfig,
  ) => Promise<void>;
  remove: (requestId: string) => Promise<void>;
  reset: () => void;
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
  record: null,
  loading: false,
  error: null,

  load: async (requestId) => {
    set({ loading: true, error: null });
    try {
      const record = await snapshotGet(requestId);
      set({ record, loading: false });
    } catch (error) {
      set({ record: null, loading: false, error: String(error) });
    }
  },

  // Save and Accept are the same upsert — the caller passes the current response
  // as the new baseline. created_at empty → Rust stamps now().
  save: async (requestId, response, scrubConfig) => {
    set({ error: null });
    try {
      const record = await snapshotPut({
        request_id: requestId,
        baseline: response,
        scrub_config: scrubConfig,
        created_at: "",
      });
      set({ record });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  remove: async (requestId) => {
    set({ error: null });
    try {
      await snapshotDelete(requestId);
      set({ record: null });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  reset: () => set({ record: null, error: null, loading: false }),
}));
