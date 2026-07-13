import { describe, expect, it } from "vitest";
import { compareSnapshot } from "./snapshot";
import type { ResponseData, ScrubConfig } from "./types";

function response(body: string, patch: Partial<ResponseData> = {}): ResponseData {
  return {
    request_id: "r1",
    status: 200,
    http_version: "2",
    headers: [],
    body,
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: body.length,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 5 },
    effective_url: "https://api.test",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
    ...patch,
  };
}

const config = (patch: Partial<ScrubConfig> = {}): ScrubConfig => ({
  paths: [],
  auto_timestamps: false,
  auto_uuids: false,
  ...patch,
});

describe("compareSnapshot", () => {
  it("returns no-baseline when the baseline is null", () => {
    const verdict = compareSnapshot(null, response("{}"), config());
    expect(verdict.status).toBe("no-baseline");
    expect(verdict.diff).toEqual([]);
  });

  it("passes when only scrubbed fields differ", () => {
    const baseline = response(JSON.stringify({ id: 1, ts: "2026-07-13T00:00:00Z" }));
    const current = response(JSON.stringify({ id: 1, ts: "2026-07-13T09:59:59Z" }));
    const verdict = compareSnapshot(baseline, current, config({ auto_timestamps: true }));
    expect(verdict.status).toBe("pass");
    expect(verdict.diff).toEqual([]);
  });

  it("fails on an added field with an addedCount", () => {
    const baseline = response(JSON.stringify({ id: 1 }));
    const current = response(JSON.stringify({ id: 1, extra: true }));
    const verdict = compareSnapshot(baseline, current, config());
    expect(verdict.status).toBe("fail");
    expect(verdict.addedCount).toBe(1);
  });

  it("fails on a value change on a non-scrubbed path with changedCount", () => {
    const baseline = response(JSON.stringify({ id: 1 }));
    const current = response(JSON.stringify({ id: 2 }));
    const verdict = compareSnapshot(baseline, current, config());
    expect(verdict.status).toBe("fail");
    expect(verdict.changedCount).toBe(1);
  });

  it("folds a type-change into changedCount", () => {
    const baseline = response(JSON.stringify({ id: 1 }));
    const current = response(JSON.stringify({ id: "1" }));
    const verdict = compareSnapshot(baseline, current, config());
    expect(verdict.status).toBe("fail");
    expect(verdict.changedCount).toBe(1);
  });

  it("falls back to text compare for non-JSON bodies (differ → non-json)", () => {
    const baseline = response("hello", { body_is_base64: true });
    const current = response("world", { body_is_base64: true });
    const verdict = compareSnapshot(baseline, current, config());
    expect(verdict.status).toBe("non-json");
    expect(verdict.diff).toHaveLength(1);
  });

  it("non-JSON identical bodies pass by raw equality", () => {
    const baseline = response("same", { body_is_base64: true });
    const current = response("same", { body_is_base64: true });
    expect(compareSnapshot(baseline, current, config()).status).toBe("pass");
  });
});
