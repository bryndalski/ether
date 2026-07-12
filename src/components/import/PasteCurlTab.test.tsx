import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { PasteCurlTab } from "./PasteCurlTab";
import { useImport } from "../../hooks/useImport";
import type { RequestSpec } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const spec: RequestSpec = {
  id: "spec-1",
  method: "POST",
  url: "https://api.test/users",
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
    <PasteCurlTab api={api} activeRequestPresent onLoadSpec={onLoadSpec} />
  );
}

describe("PasteCurlTab", () => {
  it("calls from_curl and loads the returned spec into the draft", async () => {
    mockInvoke.mockResolvedValue(spec);
    const onLoadSpec = vi.fn();
    render(<Harness onLoadSpec={onLoadSpec} />);

    fireEvent.change(screen.getByLabelText("Wklej polecenie cURL"), {
      target: { value: "curl -X POST https://api.test/users" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Wczytaj do requestu" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("from_curl", {
        command: "curl -X POST https://api.test/users",
      }),
    );
    await waitFor(() => expect(onLoadSpec).toHaveBeenCalledWith(spec, "current"));
  });
});
