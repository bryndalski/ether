import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ScanHistoryTab } from "./ScanHistoryTab";
import { useImport } from "../../hooks/useImport";
import type { RequestSpec } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const spec: RequestSpec = {
  id: "spec-1",
  method: "GET",
  url: "https://a.test",
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
};

beforeEach(() => mockInvoke.mockReset());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ onLoadSpec }: { onLoadSpec: (s: RequestSpec, m: "current" | "new") => void }) {
  const api = useImport();
  return (
    <ScanHistoryTab api={api} activeRequestPresent onLoadSpec={onLoadSpec} />
  );
}

describe("ScanHistoryTab", () => {
  it("scans the shell history and lists each curl one-liner", async () => {
    mockInvoke.mockResolvedValueOnce([
      "curl https://a.test",
      "curl -X POST https://b.test",
    ]);
    render(<Harness onLoadSpec={vi.fn()} />);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("scan_shell_history_curls", {
        limit: 200,
      }),
    );
    expect(await screen.findByText("curl https://a.test")).toBeInTheDocument();
    expect(screen.getByText("curl -X POST https://b.test")).toBeInTheDocument();
  });

  it("picking a row calls from_curl and loads the spec", async () => {
    mockInvoke.mockResolvedValueOnce(["curl https://a.test"]);
    const onLoadSpec = vi.fn();
    render(<Harness onLoadSpec={onLoadSpec} />);

    const row = await screen.findByText("curl https://a.test");
    mockInvoke.mockResolvedValueOnce(spec);
    fireEvent.click(row);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("from_curl", {
        command: "curl https://a.test",
      }),
    );
    await waitFor(() => expect(onLoadSpec).toHaveBeenCalledWith(spec, "current"));
  });

  it("shows an empty state when the history has no curls", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    render(<Harness onLoadSpec={vi.fn()} />);
    expect(await screen.findByText("No curls in history")).toBeInTheDocument();
  });
});
