import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionsStore } from "./useCollectionsStore";
import type { RequestOptions, StoredRequest } from "../lib/types";

const listCollections = vi.fn();
const listRequests = vi.fn();

vi.mock("../lib/ipc", () => ({
  listCollections: () => listCollections(),
  listRequests: () => listRequests(),
  deleteRequest: vi.fn(() => Promise.resolve()),
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
  };
}

describe("useCollectionsStore", () => {
  beforeEach(() => {
    listCollections.mockReset();
    listRequests.mockReset();
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
});
