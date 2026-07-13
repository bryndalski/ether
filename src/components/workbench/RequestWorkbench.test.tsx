import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { RequestWorkbench } from "./RequestWorkbench";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import type { ResponseData, StoredRequest } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const request: StoredRequest = {
  id: "req-1",
  collection_id: "col-1",
  name: "List users",
  method: "GET",
  url: "https://api.duotio.com/v1/users",
  headers: [{ name: "Accept", value: "application/json", enabled: true }],
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
  sort_order: 0,
  docs_md: null,
  graphql: null,
  assertions: [],
};

const okResponse: ResponseData = {
  request_id: "req-1",
  status: 200,
  http_version: "HTTP/2",
  headers: [{ name: "content-type", value: "application/json", enabled: true }],
  body: '{"total":2}',
  body_is_base64: false,
  body_truncated_at: null,
  size_download_bytes: 1270,
  timings: { dns_ms: 11, connect_ms: 30, tls_ms: 57, ttfb_ms: 126, total_ms: 148 },
  effective_url: "https://api.duotio.com/v1/users",
  redirect_chain: [],
  verbose_log: "* Trying …\n> GET /v1/users HTTP/2\n< HTTP/2 200",
  tls: { protocol: "1.3", cipher: null, verify_ok: true, cert_chain: [] },
};

function seedActive(active: StoredRequest | null) {
  useCollectionsStore.setState({
    collections: [],
    requests: active ? [active] : [],
    activeRequestId: active?.id ?? null,
    loading: false,
    loadError: null,
    loadFailed: false,
  });
  useEnvStore.setState({
    environments: [],
    activeEnvironmentId: "env-staging",
    loading: false,
    loadFailed: false,
  });
}

beforeEach(() => mockInvoke.mockReset());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RequestWorkbench", () => {
  it("Send calls resolve_and_send with the exact draft + active env id", async () => {
    seedActive(request);
    mockInvoke.mockResolvedValue(okResponse);
    render(<RequestWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("resolve_and_send", {
        request,
        environmentId: "env-staging",
      }),
    );
    // never leaks secrets via to_curl on Send
    expect(mockInvoke).not.toHaveBeenCalledWith("to_curl", expect.anything());
    // success renders the status + waterfall
    expect(await screen.findByText("200")).toBeInTheDocument();
  });

  it("opening the cURL tab calls resolve_preview_curl and NEVER to_curl", async () => {
    seedActive(request);
    mockInvoke.mockResolvedValue("curl 'https://api.duotio.com/v1/users'");
    render(<RequestWorkbench />);

    fireEvent.click(screen.getByRole("tab", { name: /cURL/ }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("resolve_preview_curl", {
        request,
        environmentId: "env-staging",
      }),
    );
    const commands = mockInvoke.mock.calls.map((call) => call[0]);
    expect(commands).not.toContain("to_curl");
  });

  it("disables Send when the URL is empty and enables it once typed", () => {
    seedActive({ ...request, url: "" });
    render(<RequestWorkbench />);

    const send = screen.getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Request URL"), {
      target: { value: "https://api/x" },
    });
    expect(
      screen.getByRole("button", { name: "Send request" }),
    ).not.toBeDisabled();
  });

  it("exposes request tabs as role=tab with aria-selected", () => {
    seedActive(request);
    render(<RequestWorkbench />);
    const params = screen.getByRole("tab", { name: /Params/ });
    expect(params).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Headers/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("Enter in the URL field sends the request", async () => {
    seedActive(request);
    mockInvoke.mockResolvedValue(okResponse);
    render(<RequestWorkbench />);

    fireEvent.keyDown(screen.getByLabelText("Request URL"), { key: "Enter" });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "resolve_and_send",
        expect.objectContaining({ environmentId: "env-staging" }),
      ),
    );
  });
});
