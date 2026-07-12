import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryStore } from "./useHistoryStore";
import type { HistoryEntry } from "../lib/types";

const historyList = vi.fn();
const historyClear = vi.fn();

vi.mock("../lib/ipc", () => ({
  historyList: (requestId: string | null, limit: number | null) =>
    historyList(requestId, limit),
  historyClear: () => historyClear(),
}));

function entry(id: string): HistoryEntry {
  return {
    id,
    request_id: "req-1",
    executed_at: "2026-07-13T00:00:00.000Z",
    request: {
      id,
      method: "GET",
      url: "https://api.example.com",
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
    },
    response: {
      request_id: id,
      status: 200,
      http_version: "HTTP/2",
      headers: [],
      body: "{}",
      body_is_base64: false,
      body_truncated_at: null,
      size_download_bytes: 2,
      timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 10 },
      effective_url: "https://api.example.com",
      redirect_chain: [],
      verbose_log: "",
      tls: null,
    },
  };
}

const initial = useHistoryStore.getState();

describe("useHistoryStore", () => {
  beforeEach(() => {
    historyList.mockReset();
    historyClear.mockReset();
    historyList.mockResolvedValue([entry("h1"), entry("h2"), entry("h3")]);
    historyClear.mockResolvedValue(undefined);
    useHistoryStore.setState({
      ...initial,
      entries: [],
      loading: false,
      error: null,
      scope: "all",
      selectedIds: [],
      openedId: null,
      drawerOpen: false,
      diffOpen: false,
      limit: null,
    });
  });

  it("load (scope=all) calls history_list with requestId:null and stores entries", async () => {
    await useHistoryStore.getState().load("req-99", null);
    expect(historyList).toHaveBeenCalledWith(null, null);
    expect(useHistoryStore.getState().entries).toHaveLength(3);
    expect(useHistoryStore.getState().loading).toBe(false);
    expect(useHistoryStore.getState().error).toBeNull();
  });

  it("load (scope=request) passes the active request id through", async () => {
    useHistoryStore.setState({ scope: "request" });
    await useHistoryStore.getState().load("req-42", 200);
    expect(historyList).toHaveBeenCalledWith("req-42", 200);
  });

  it("load reject sets error, empties entries, clears loading (no throw)", async () => {
    historyList.mockRejectedValueOnce("boom");
    await useHistoryStore.getState().load(null, null);
    const state = useHistoryStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toContain("boom");
  });

  it("clear calls history_clear and resets entries/selection/diff", async () => {
    useHistoryStore.setState({
      entries: [entry("h1")],
      selectedIds: ["h1"],
      openedId: "h1",
      diffOpen: true,
    });
    await useHistoryStore.getState().clear();
    expect(historyClear).toHaveBeenCalledTimes(1);
    const state = useHistoryStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.selectedIds).toEqual([]);
    expect(state.openedId).toBeNull();
    expect(state.diffOpen).toBe(false);
  });

  it("toggleSelect enforces max-2 FIFO and openDiff needs exactly two", () => {
    const store = useHistoryStore.getState();
    store.toggleSelect("a");
    store.toggleSelect("b");
    expect(useHistoryStore.getState().selectedIds).toEqual(["a", "b"]);
    // selecting a third drops the oldest ("a")
    useHistoryStore.getState().toggleSelect("c");
    expect(useHistoryStore.getState().selectedIds).toEqual(["b", "c"]);
    // deselect removes
    useHistoryStore.getState().toggleSelect("b");
    expect(useHistoryStore.getState().selectedIds).toEqual(["c"]);
    // openDiff is a no-op with only one selected
    useHistoryStore.getState().openDiff();
    expect(useHistoryStore.getState().diffOpen).toBe(false);
    useHistoryStore.getState().toggleSelect("d");
    useHistoryStore.getState().openDiff();
    expect(useHistoryStore.getState().diffOpen).toBe(true);
  });
});
