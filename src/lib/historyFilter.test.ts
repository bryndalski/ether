import { describe, expect, it } from "vitest";
import {
  EMPTY_HISTORY_FILTERS,
  filterHistory,
  historyFiltersActive,
  statusBucket,
} from "./historyFilter";
import type { HistoryEntry } from "./types";

function entry(
  id: string,
  method: string,
  url: string,
  status: number,
): HistoryEntry {
  return {
    id,
    request_id: null,
    executed_at: new Date().toISOString(),
    request: {
      id,
      method,
      url,
      headers: [],
      query_params: [],
      body: { type: "none" },
      auth: { type: "none" },
      options: {
        follow_redirects: true,
        max_redirects: 5,
        timeout_ms: 30000,
        insecure: false,
        ca_bundle_path: null,
        compressed: true,
        cookie_jar: null,
      },
    },
    response: {
      status,
      http_version: "HTTP/1.1",
      headers: [],
      body: "",
      body_base64: null,
      is_binary: false,
      size_bytes: 0,
      timings: null,
      effective_url: url,
      truncated: false,
    },
  } as unknown as HistoryEntry;
}

const entries = [
  entry("a", "GET", "https://api/users", 200),
  entry("b", "POST", "https://api/users", 404),
  entry("c", "DELETE", "https://api/orders", 500),
  entry("d", "GET", "https://api/health", 0),
];

describe("statusBucket", () => {
  it("maps codes to buckets", () => {
    expect(statusBucket(204)).toBe("2xx");
    expect(statusBucket(301)).toBe("3xx");
    expect(statusBucket(404)).toBe("4xx");
    expect(statusBucket(503)).toBe("5xx");
    expect(statusBucket(0)).toBe("error");
  });
});

describe("filterHistory", () => {
  it("passes through with no active filters", () => {
    expect(filterHistory(entries, EMPTY_HISTORY_FILTERS)).toBe(entries);
  });

  it("filters by status bucket", () => {
    const out = filterHistory(entries, { buckets: ["4xx", "5xx"], methods: [], text: "" });
    expect(out.map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("filters by method", () => {
    const out = filterHistory(entries, { buckets: [], methods: ["GET"], text: "" });
    expect(out.map((e) => e.id)).toEqual(["a", "d"]);
  });

  it("filters by url text", () => {
    const out = filterHistory(entries, { buckets: [], methods: [], text: "orders" });
    expect(out.map((e) => e.id)).toEqual(["c"]);
  });

  it("combines facets (AND)", () => {
    const out = filterHistory(entries, { buckets: ["2xx"], methods: ["GET"], text: "users" });
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("historyFiltersActive reflects any active facet", () => {
    expect(historyFiltersActive(EMPTY_HISTORY_FILTERS)).toBe(false);
    expect(historyFiltersActive({ buckets: [], methods: [], text: " " })).toBe(false);
    expect(historyFiltersActive({ buckets: ["2xx"], methods: [], text: "" })).toBe(true);
  });
});
