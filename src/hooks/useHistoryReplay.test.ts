import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHistoryReplay } from "./useHistoryReplay";
import { REDACTED } from "../lib/replay";
import type { Auth, HistoryEntry, StoredRequest } from "../lib/types";

const options: StoredRequest["options"] = {
  follow_redirects: true,
  max_redirects: 10,
  timeout_ms: 30_000,
  insecure: false,
  ca_bundle_path: null,
  compressed: true,
  cookie_jar: null,
};

function draft(): StoredRequest {
  return {
    id: "draft",
    collection_id: "col",
    name: "req",
    method: "GET",
    url: "https://old",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options,
    sort_order: 0,
    docs_md: null,
    graphql: null,
    assertions: [],
  };
}

function entry(auth: Auth): HistoryEntry {
  return {
    id: "h1",
    request_id: "req-1",
    executed_at: "2026-07-13T00:00:00.000Z",
    request: {
      id: "h1",
      method: "POST",
      url: "https://api.example.com",
      headers: [],
      query_params: [],
      body: { type: "raw", content_type: "application/json", text: "{}" },
      auth,
      options,
    },
    response: {
      request_id: "h1",
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

describe("useHistoryReplay — the secret-leak guard", () => {
  it("replaying a ••• bearer entry imports the draft but does NOT send", () => {
    const dispatch = vi.fn();
    const sendDraft = vi.fn();
    const bearer: Auth = { type: "bearer", token: REDACTED };
    const { result } = renderHook(() =>
      useHistoryReplay({ dispatch, sendDraft, draft: draft() }),
    );

    act(() => result.current.replay(entry(bearer)));

    // Structure is imported into the draft…
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "importSpec" }),
    );
    // …but a ••• secret must never be sent as a credential.
    expect(sendDraft).not.toHaveBeenCalled();
    expect(result.current.holes).toEqual([
      { kind: "auth-bearer", name: "Authorization (Bearer)" },
    ]);
  });

  it("replaying a secret-free entry may load-and-send immediately (fast path)", () => {
    const dispatch = vi.fn();
    const sendDraft = vi.fn();
    const { result } = renderHook(() =>
      useHistoryReplay({ dispatch, sendDraft, draft: draft() }),
    );

    act(() => result.current.replay(entry({ type: "none" })));

    expect(dispatch).toHaveBeenCalled();
    expect(sendDraft).toHaveBeenCalledTimes(1);
    // the sent draft carries the imported method/url
    expect(sendDraft.mock.calls[0][0].method).toBe("POST");
    expect(sendDraft.mock.calls[0][0].url).toBe("https://api.example.com");
    expect(result.current.holes).toEqual([]);
  });
});
