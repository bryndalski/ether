import { create } from "zustand";
import {
  deleteRequest as deleteRequestIpc,
  listCollections,
  listRequests,
} from "../lib/ipc";
import type { Collection, StoredRequest } from "../lib/types";

interface CollectionsState {
  collections: Collection[];
  requests: StoredRequest[];
  activeRequestId: string | null;
  loading: boolean;
  /** Set when the backend command returned Err (e.g. "not implemented"). */
  loadError: string | null;
  loadFailed: boolean;

  load: () => Promise<void>;
  selectRequest: (id: string | null) => void;
  removeRequest: (id: string) => Promise<void>;

  activeRequest: () => StoredRequest | null;
  requestsForCollection: (collectionId: string) => StoredRequest[];
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  requests: [],
  activeRequestId: null,
  loading: false,
  loadError: null,
  loadFailed: false,

  load: async () => {
    set({ loading: true, loadError: null, loadFailed: false });
    try {
      const [collections, requests] = await Promise.all([
        listCollections(),
        listRequests(null),
      ]);
      set({
        collections,
        requests,
        loading: false,
        activeRequestId: requests[0]?.id ?? null,
      });
    } catch (error) {
      // Backend stubs return Err until the store stream lands — surface a
      // clean empty state rather than crashing the shell.
      set({
        collections: [],
        requests: [],
        loading: false,
        loadFailed: true,
        loadError: String(error),
      });
    }
  },

  selectRequest: (id) => set({ activeRequestId: id }),

  removeRequest: async (id) => {
    try {
      await deleteRequestIpc(id);
    } catch {
      // Ignore backend failure; still drop it from the local view.
    }
    const requests = get().requests.filter((request) => request.id !== id);
    const activeRequestId =
      get().activeRequestId === id ? null : get().activeRequestId;
    set({ requests, activeRequestId });
  },

  activeRequest: () => {
    const { requests, activeRequestId } = get();
    return requests.find((request) => request.id === activeRequestId) ?? null;
  },

  requestsForCollection: (collectionId) =>
    get().requests.filter((request) => request.collection_id === collectionId),
}));
