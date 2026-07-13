import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSnapshotStore } from "./useSnapshotStore";
import type { ResponseData, ScrubConfig, SnapshotRecord } from "../lib/types";

const snapshotGet = vi.fn();
const snapshotPut = vi.fn();
const snapshotDelete = vi.fn();

vi.mock("../lib/ipc", () => ({
  snapshotGet: (requestId: string) => snapshotGet(requestId),
  snapshotPut: (record: SnapshotRecord) => snapshotPut(record),
  snapshotDelete: (requestId: string) => snapshotDelete(requestId),
}));

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
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 1 },
    effective_url: "https://api.test",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

const scrub: ScrubConfig = { paths: [], auto_timestamps: true, auto_uuids: false };

function record(): SnapshotRecord {
  return { request_id: "r1", baseline: response(), scrub_config: scrub, created_at: "t" };
}

describe("useSnapshotStore", () => {
  beforeEach(() => {
    snapshotGet.mockReset();
    snapshotPut.mockReset();
    snapshotDelete.mockReset();
    useSnapshotStore.setState({ record: null, loading: false, error: null });
  });

  it("load calls snapshot_get and stores the record", async () => {
    snapshotGet.mockResolvedValue(record());
    await useSnapshotStore.getState().load("r1");
    expect(snapshotGet).toHaveBeenCalledWith("r1");
    expect(useSnapshotStore.getState().record?.request_id).toBe("r1");
    expect(useSnapshotStore.getState().loading).toBe(false);
  });

  it("save calls snapshot_put with the current response as baseline", async () => {
    snapshotPut.mockImplementation((r: SnapshotRecord) => Promise.resolve(r));
    await useSnapshotStore.getState().save("r1", response(), scrub);
    expect(snapshotPut).toHaveBeenCalledWith({
      request_id: "r1",
      baseline: response(),
      scrub_config: scrub,
      created_at: "",
    });
    expect(useSnapshotStore.getState().record?.baseline.status).toBe(200);
  });

  it("remove calls snapshot_delete and nulls the record", async () => {
    useSnapshotStore.setState({ record: record() });
    snapshotDelete.mockResolvedValue(undefined);
    await useSnapshotStore.getState().remove("r1");
    expect(snapshotDelete).toHaveBeenCalledWith("r1");
    expect(useSnapshotStore.getState().record).toBeNull();
  });

  it("load reject sets error without throwing", async () => {
    snapshotGet.mockRejectedValueOnce("boom");
    await useSnapshotStore.getState().load("r1");
    const state = useSnapshotStore.getState();
    expect(state.record).toBeNull();
    expect(state.error).toContain("boom");
  });
});
