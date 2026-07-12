import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useCopyAsCurl } from "./useCopyAsCurl";
import { useToast } from "../state/useToast";
import type { StoredRequest } from "../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const REAL_SECRET = "SUPER_SECRET_TOKEN";
const REDACTED = "curl 'https://api.test/x' -H 'Authorization: Bearer •••'";

const draft: StoredRequest = {
  id: "req-1",
  collection_id: "c",
  name: "r",
  method: "GET",
  url: "https://api.test/x",
  headers: [],
  query_params: [],
  body: { type: "none" },
  auth: { type: "bearer", token: "{{secret.token}}" },
  options: {
    follow_redirects: true,
    max_redirects: 10,
    timeout_ms: 30_000,
    insecure: false,
    ca_bundle_path: null,
    compressed: true,
    cookie_jar: null,
  },
  sort_order: 0,
  docs_md: null,
  graphql: null,
};

const writeText = vi.fn();

beforeEach(() => {
  mockInvoke.mockReset();
  writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText } });
  useToast.setState({ toasts: [] });
});
afterEach(() => vi.clearAllMocks());

describe("useCopyAsCurl", () => {
  it("copies the REDACTED resolve_preview_curl string, never a raw secret", async () => {
    mockInvoke.mockResolvedValue(REDACTED);
    const { result } = renderHook(() => useCopyAsCurl(draft, "env-1"));

    await act(async () => {
      await result.current();
    });

    expect(mockInvoke).toHaveBeenCalledWith("resolve_preview_curl", {
      request: draft,
      environmentId: "env-1",
    });
    expect(writeText).toHaveBeenCalledWith(REDACTED);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("•••");
    expect(copied).not.toContain(REAL_SECRET);
  });

  it("never calls to_curl", async () => {
    mockInvoke.mockResolvedValue(REDACTED);
    const { result } = renderHook(() => useCopyAsCurl(draft, null));
    await act(async () => {
      await result.current();
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("to_curl", expect.anything());
  });

  it("shows a success toast after a copy", async () => {
    mockInvoke.mockResolvedValue(REDACTED);
    const { result } = renderHook(() => useCopyAsCurl(draft, null));
    await act(async () => {
      await result.current();
    });
    const toasts = useToast.getState().toasts;
    expect(toasts[0]?.variant).toBe("success");
  });
});
