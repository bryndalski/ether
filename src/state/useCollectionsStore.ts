import { create } from "zustand";
import {
  deleteCollection as deleteCollectionIpc,
  deleteRequest as deleteRequestIpc,
  listCollections,
  listRequests,
  upsertCollection as upsertCollectionIpc,
  upsertRequest as upsertRequestIpc,
} from "../lib/ipc";
import type { Collection, RequestOptions, StoredRequest } from "../lib/types";
import { descendantCollectionIds } from "../lib/collectionTree";
import { makeId } from "../lib/ids";
import { translate } from "../i18n";
import { currentLocale } from "../i18n/useT";

const DEFAULT_OPTIONS: RequestOptions = {
  follow_redirects: true,
  max_redirects: 10,
  timeout_ms: 30_000,
  insecure: false,
  ca_bundle_path: null,
  compressed: true,
  cookie_jar: null,
};

export type ReorderOp =
  | {
      kind: "request";
      newParentId: string;
      siblings: { id: string; sort_order: number }[];
    }
  | {
      kind: "collection";
      siblings: { id: string; sort_order: number }[];
    };

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

  // mutations (optimistic + IPC + rollback)
  createCollection: (parentId: string | null) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  removeCollection: (id: string) => Promise<void>;
  createRequest: (collectionId: string) => Promise<string>;
  renameRequest: (id: string, name: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<string>;
  saveRequest: (draft: StoredRequest) => Promise<void>;
  reorder: (op: ReorderOp) => Promise<void>;

  activeRequest: () => StoredRequest | null;
  requestsForCollection: (collectionId: string) => StoredRequest[];
}

/** Snapshot of the mutable slice so any optimistic action can roll back on a
 *  rejected IPC (the pattern removeRequest already demonstrated). */
type Snapshot = Pick<
  CollectionsState,
  "collections" | "requests" | "activeRequestId"
>;

export const useCollectionsStore = create<CollectionsState>((set, get) => {
  function snapshot(): Snapshot {
    const { collections, requests, activeRequestId } = get();
    return { collections, requests, activeRequestId };
  }

  return {
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
      const before = snapshot();
      const requests = get().requests.filter((request) => request.id !== id);
      const activeRequestId =
        get().activeRequestId === id ? null : get().activeRequestId;
      set({ requests, activeRequestId });
      try {
        await deleteRequestIpc(id);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    createCollection: async (parentId) => {
      const before = snapshot();
      const siblings = get().collections.filter(
        (collection) => collection.parent_id === parentId,
      );
      const collection: Collection = {
        id: makeId("col"),
        name: translate(currentLocale(), "sidebar.defaultCollectionName"),
        parent_id: parentId,
        sort_order: siblings.length,
        docs_md: null,
      };
      set({ collections: [...get().collections, collection] });
      try {
        await upsertCollectionIpc(collection);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    renameCollection: async (id, name) => {
      const before = snapshot();
      const target = get().collections.find((collection) => collection.id === id);
      if (!target) return;
      const next = { ...target, name };
      set({
        collections: get().collections.map((collection) =>
          collection.id === id ? next : collection,
        ),
      });
      try {
        await upsertCollectionIpc(next);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    removeCollection: async (id) => {
      const before = snapshot();
      // Mirror a full-subtree delete so the tree never shows orphans.
      const subtree = new Set(descendantCollectionIds(get().collections, id));
      const collections = get().collections.filter(
        (collection) => !subtree.has(collection.id),
      );
      const requests = get().requests.filter(
        (request) => !subtree.has(request.collection_id),
      );
      const activeStillPresent = requests.some(
        (request) => request.id === get().activeRequestId,
      );
      set({
        collections,
        requests,
        activeRequestId: activeStillPresent ? get().activeRequestId : null,
      });
      try {
        await deleteCollectionIpc(id);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    createRequest: async (collectionId) => {
      const before = snapshot();
      const siblings = get().requests.filter(
        (request) => request.collection_id === collectionId,
      );
      const request: StoredRequest = {
        id: makeId("req"),
        collection_id: collectionId,
        name: translate(currentLocale(), "sidebar.defaultRequestName"),
        method: "GET",
        url: "",
        headers: [],
        query_params: [],
        body: { type: "none" },
        auth: { type: "none" },
        options: DEFAULT_OPTIONS,
        sort_order: siblings.length,
        docs_md: null,
        graphql: null,
        assertions: [],
        pre_script: null,
        post_script: null,
      };
      // Push + select so the workbench draft seeds from it (§5 contract).
      set({
        requests: [...get().requests, request],
        activeRequestId: request.id,
      });
      try {
        await upsertRequestIpc(request);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
      return request.id;
    },

    renameRequest: async (id, name) => {
      const before = snapshot();
      const target = get().requests.find((request) => request.id === id);
      if (!target) return;
      const next = { ...target, name };
      set({
        requests: get().requests.map((request) =>
          request.id === id ? next : request,
        ),
      });
      try {
        await upsertRequestIpc(next);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    duplicateRequest: async (id) => {
      const before = snapshot();
      const original = get().requests.find((request) => request.id === id);
      if (!original) return "";
      const copy: StoredRequest = {
        ...structuredClone(original),
        id: makeId("req"),
        name: translate(currentLocale(), "sidebar.copySuffix", {
          name: original.name,
        }),
        sort_order: original.sort_order + 1,
      };
      set({
        requests: [...get().requests, copy],
        activeRequestId: copy.id,
      });
      try {
        await upsertRequestIpc(copy);
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
      return copy.id;
    },

    saveRequest: async (draft) => {
      const before = snapshot();
      const exists = get().requests.some((request) => request.id === draft.id);
      set({
        requests: exists
          ? get().requests.map((request) =>
              request.id === draft.id ? draft : request,
            )
          : [...get().requests, draft],
      });
      try {
        const saved = await upsertRequestIpc(draft);
        // Replace the in-memory entry with the canonical entity from Rust.
        set({
          requests: get().requests.map((request) =>
            request.id === saved.id ? saved : request,
          ),
        });
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    reorder: async (op) => {
      const before = snapshot();
      if (op.kind === "collection") {
        const sortById = new Map(op.siblings.map((s) => [s.id, s.sort_order]));
        set({
          collections: get().collections.map((collection) =>
            sortById.has(collection.id)
              ? { ...collection, sort_order: sortById.get(collection.id)! }
              : collection,
          ),
        });
        const changed = get().collections.filter((collection) =>
          sortById.has(collection.id),
        );
        try {
          await Promise.all(changed.map(upsertCollectionIpc));
        } catch (error) {
          set({ ...before, loadError: String(error) });
        }
        return;
      }

      const sortById = new Map(op.siblings.map((s) => [s.id, s.sort_order]));
      set({
        requests: get().requests.map((request) =>
          sortById.has(request.id)
            ? {
                ...request,
                sort_order: sortById.get(request.id)!,
                collection_id: op.newParentId,
              }
            : request,
        ),
      });
      const changed = get().requests.filter((request) =>
        sortById.has(request.id),
      );
      try {
        await Promise.all(changed.map(upsertRequestIpc));
      } catch (error) {
        set({ ...before, loadError: String(error) });
      }
    },

    activeRequest: () => {
      const { requests, activeRequestId } = get();
      return requests.find((request) => request.id === activeRequestId) ?? null;
    },

    requestsForCollection: (collectionId) =>
      get().requests.filter((request) => request.collection_id === collectionId),
  };
});
