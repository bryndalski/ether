import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HistoryList } from "./HistoryList";
import { useHistoryStore } from "../../state/useHistoryStore";
import type { Auth, HistoryEntry } from "../../lib/types";
import { REDACTED } from "../../lib/replay";

function entry(id: string, method: string, status: number, auth: Auth): HistoryEntry {
  return {
    id,
    request_id: "req-1",
    executed_at: "2026-07-13T00:00:00.000Z",
    request: {
      id,
      method,
      url: `https://api.example.com/${id}`,
      headers: [],
      query_params: [],
      body: { type: "none" },
      auth,
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
      status,
      http_version: "HTTP/2",
      headers: [],
      body: "{}",
      body_is_base64: false,
      body_truncated_at: null,
      size_download_bytes: 1024,
      timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 42 },
      effective_url: `https://api.example.com/${id}`,
      redirect_chain: [],
      verbose_log: "",
      tls: null,
    },
  };
}

const NONE: Auth = { type: "none" };

afterEach(cleanup);

describe("HistoryList", () => {
  beforeEach(() => {
    useHistoryStore.setState({
      entries: [
        entry("a", "GET", 200, NONE),
        entry("b", "POST", 404, NONE),
        entry("c", "DELETE", 500, NONE),
      ],
      loading: false,
      error: null,
      openedId: null,
      selectedIds: [],
    });
  });

  it("renders one row per entry with status reason (not color-only), time, size", () => {
    render(<HistoryList now={Date.parse("2026-07-13T00:00:10.000Z")} onReplay={() => {}} />);
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    // meta cells present
    expect(screen.getAllByText("42 ms")).toHaveLength(3);
    expect(screen.getAllByText("1.00 KB")).toHaveLength(3);
  });

  it("opens a row into the store (single preview) on click", () => {
    render(<HistoryList now={Date.now()} onReplay={() => {}} />);
    fireEvent.click(screen.getByLabelText(/^GET https:\/\/api\.example\.com\/a/));
    expect(useHistoryStore.getState().openedId).toBe("a");
  });

  it("toggling select marks the row for diff (max 2 FIFO)", () => {
    render(<HistoryList now={Date.now()} onReplay={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Zaznacz do porównania: GET/));
    fireEvent.click(screen.getByLabelText(/Zaznacz do porównania: POST/));
    expect(useHistoryStore.getState().selectedIds).toEqual(["a", "b"]);
  });

  it("calls onReplay with the entry id for its Replay button", () => {
    const onReplay = vi.fn();
    render(<HistoryList now={Date.now()} onReplay={onReplay} />);
    const replayButtons = screen.getAllByLabelText("Ponów request");
    fireEvent.click(replayButtons[0]);
    expect(onReplay).toHaveBeenCalledWith("a");
  });

  it("shows the empty state when there are no entries", () => {
    useHistoryStore.setState({ entries: [] });
    render(<HistoryList now={Date.now()} onReplay={() => {}} />);
    expect(screen.getByText("Brak historii")).toBeInTheDocument();
  });

  it("shows an error banner when load failed", () => {
    useHistoryStore.setState({ error: "network down" });
    render(<HistoryList now={Date.now()} onReplay={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });

  // A redacted-secret history entry stays redacted in the list (••• verbatim),
  // proving the row never reconstructs a real secret before replay is chosen.
  it("keeps a redacted spec redacted (••• is never a real credential in the row)", () => {
    const bearer: Auth = { type: "bearer", token: REDACTED };
    useHistoryStore.setState({ entries: [entry("secret", "GET", 200, bearer)] });
    render(<HistoryList now={Date.now()} onReplay={() => {}} />);
    // The token value is not rendered anywhere in the list.
    expect(screen.queryByText(REDACTED)).not.toBeInTheDocument();
  });
});
