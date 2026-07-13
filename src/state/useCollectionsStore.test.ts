import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionsStore } from "./useCollectionsStore";
import type { Collection, RequestOptions, StoredRequest } from "../lib/types";

const listCollections = vi.fn();
const listRequests = vi.fn();
const upsertRequest = vi.fn((request: StoredRequest) =>
  Promise.resolve(request),
);
const upsertCollection = vi.fn((collection: Collection) =>
  Promise.resolve(collection),
);
const deleteCollection = vi.fn((_id: string) => Promise.resolve());
const deleteRequest = vi.fn((_id: string) => Promise.resolve());

vi.mock("../lib/ipc", () => ({
  listCollections: () => listCollections(),
  listRequests: () => listRequests(),
  upsertRequest: (request: StoredRequest) => upsertRequest(request),
  upsertCollection: (collection: Collection) => upsertCollection(collection),
  deleteCollection: (id: string) => deleteCollection(id),
  deleteRequest: (id: string) => deleteRequest(id),
}));

const OPTIONS: RequestOptions = {
  follow_redirects: true,
  max_redirects: 10,
  timeout_ms: 30_000,
  insecure: false,
  ca_bundle_path: null,
  compressed: true,
  cookie_jar: null,
};

function makeRequest(id: string): StoredRequest {
  return {
    id,
    collection_id: "c1",
    name: `req ${id}`,
    method: "GET",
    url: "https://example.com",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: OPTIONS,
    sort_order: 0,
    docs_md: null,
    graphql: null,
    assertions: [],
  };
}

describe("useCollectionsStore", () => {
  beforeEach(() => {
    listCollections.mockReset();
    listRequests.mockReset();
    upsertRequest.mockReset();
    upsertRequest.mockImplementation((request) => Promise.resolve(request));
    upsertCollection.mockReset();
    upsertCollection.mockImplementation((collection) =>
      Promise.resolve(collection),
    );
    deleteCollection.mockReset();
    deleteCollection.mockImplementation(() => Promise.resolve());
    deleteRequest.mockReset();
    deleteRequest.mockImplementation(() => Promise.resolve());
    useCollectionsStore.setState({
      collections: [],
      requests: [],
      activeRequestId: null,
      loading: false,
      loadError: null,
      loadFailed: false,
    });
  });

  it("selects a request", () => {
    useCollectionsStore.setState({
      requests: [makeRequest("a"), makeRequest("b")],
    });
    useCollectionsStore.getState().selectRequest("b");
    expect(useCollectionsStore.getState().activeRequestId).toBe("b");
    expect(useCollectionsStore.getState().activeRequest()?.id).toBe("b");
  });

  it("falls back to an empty state when the backend returns Err", async () => {
    listCollections.mockRejectedValue(
      "not implemented: store::list_collections",
    );
    listRequests.mockRejectedValue("not implemented: store::list_requests");

    await useCollectionsStore.getState().load();

    const state = useCollectionsStore.getState();
    expect(state.loadFailed).toBe(true);
    expect(state.requests).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.loadError).toContain("not implemented");
  });

  it("createRequest pushes optimistically, auto-selects, and upserts with the collection id", async () => {
    useCollectionsStore.setState({ requests: [makeRequest("a")] });
    const promise = useCollectionsStore.getState().createRequest("c9");
    // Optimistic: new request present and selected before the IPC resolves.
    const afterOptimistic = useCollectionsStore.getState();
    expect(afterOptimistic.requests).toHaveLength(2);
    const created = afterOptimistic.requests.find((r) => r.id !== "a")!;
    expect(afterOptimistic.activeRequestId).toBe(created.id);
    expect(created.collection_id).toBe("c9");
    await promise;
    expect(upsertRequest).toHaveBeenCalledTimes(1);
    expect(upsertRequest.mock.calls[0][0].collection_id).toBe("c9");
  });

  it("removeRequest drops it immediately and rolls back on IPC reject", async () => {
    useCollectionsStore.setState({
      requests: [makeRequest("a"), makeRequest("b")],
      activeRequestId: "a",
    });
    deleteRequest.mockRejectedValueOnce("boom");
    await useCollectionsStore.getState().removeRequest("a");
    const state = useCollectionsStore.getState();
    // rolled back
    expect(state.requests.map((r) => r.id)).toEqual(["a", "b"]);
    expect(state.loadError).toBe("boom");
  });

  it("renameCollection patches the name then upserts; rolls back on reject", async () => {
    useCollectionsStore.setState({
      collections: [
        { id: "c1", name: "Old", parent_id: null, sort_order: 0, docs_md: null },
      ],
    });
    await useCollectionsStore.getState().renameCollection("c1", "New");
    expect(useCollectionsStore.getState().collections[0].name).toBe("New");
    expect(upsertCollection.mock.calls[0][0].name).toBe("New");

    upsertCollection.mockRejectedValueOnce("nope");
    await useCollectionsStore.getState().renameCollection("c1", "Broken");
    expect(useCollectionsStore.getState().collections[0].name).toBe("New");
  });

  it("removeCollection cascades the subtree and its requests in memory", async () => {
    useCollectionsStore.setState({
      collections: [
        { id: "root", name: "R", parent_id: null, sort_order: 0, docs_md: null },
        { id: "child", name: "C", parent_id: "root", sort_order: 0, docs_md: null },
      ],
      requests: [
        { ...makeRequest("r1"), collection_id: "child" },
        { ...makeRequest("r2"), collection_id: "root" },
      ],
      activeRequestId: "r1",
    });
    await useCollectionsStore.getState().removeCollection("root");
    const state = useCollectionsStore.getState();
    expect(state.collections).toEqual([]);
    expect(state.requests).toEqual([]);
    expect(state.activeRequestId).toBeNull();
    expect(deleteCollection).toHaveBeenCalledWith("root");
  });

  it("duplicateRequest deep-clones with a fresh id, (copy) name and selects it", async () => {
    useCollectionsStore.setState({ requests: [makeRequest("a")] });
    const newId = await useCollectionsStore.getState().duplicateRequest("a");
    const state = useCollectionsStore.getState();
    const copy = state.requests.find((r) => r.id === newId)!;
    expect(copy.name).toBe("req a (copy)");
    expect(copy.id).not.toBe("a");
    expect(state.activeRequestId).toBe(newId);
  });

  it("saveRequest upserts the draft and replaces the in-memory entry", async () => {
    useCollectionsStore.setState({
      requests: [makeRequest("a")],
      activeRequestId: "a",
    });
    const draft = { ...makeRequest("a"), url: "https://api/edited" };
    await useCollectionsStore.getState().saveRequest(draft);
    expect(upsertRequest.mock.calls[0][0]).toEqual(draft);
    expect(useCollectionsStore.getState().activeRequest()).toEqual(draft);
  });

  it("reorder applies dense sort_order and upserts each changed request", async () => {
    useCollectionsStore.setState({
      requests: [
        { ...makeRequest("a"), sort_order: 0 },
        { ...makeRequest("b"), sort_order: 1 },
      ],
    });
    await useCollectionsStore.getState().reorder({
      kind: "request",
      newParentId: "c1",
      siblings: [
        { id: "b", sort_order: 0 },
        { id: "a", sort_order: 1 },
      ],
    });
    const state = useCollectionsStore.getState();
    const byId = Object.fromEntries(state.requests.map((r) => [r.id, r]));
    expect(byId.b.sort_order).toBe(0);
    expect(byId.a.sort_order).toBe(1);
    expect(upsertRequest).toHaveBeenCalledTimes(2);
  });
});
