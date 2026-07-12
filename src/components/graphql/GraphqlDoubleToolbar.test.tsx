import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { RequestWorkbench } from "../workbench/RequestWorkbench";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import type { StoredRequest } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const graphqlRequest: StoredRequest = {
  id: "req-gql",
  collection_id: "col-1",
  name: "Gql",
  method: "POST",
  url: "https://api.test/graphql",
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
  sort_order: 0,
  docs_md: null,
  graphql: { operation_type: "query", query: "", variables_json: "{}" },
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  useCollectionsStore.setState({
    collections: [],
    requests: [graphqlRequest],
    activeRequestId: graphqlRequest.id,
    loading: false,
    loadError: null,
    loadFailed: false,
  });
  useEnvStore.setState({
    environments: [],
    activeEnvironmentId: null,
    loading: false,
    loadFailed: false,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GraphQL single toolbar (no duplicate RequestBar)", () => {
  it("renders exactly one URL input and one toolbar in GraphQL mode", () => {
    render(<RequestWorkbench />);
    expect(screen.getAllByLabelText("URL requestu")).toHaveLength(1);
    expect(screen.getAllByRole("toolbar")).toHaveLength(1);
  });

  it("keeps the request-type toggle, Save and Copy in the single toolbar", () => {
    render(<RequestWorkbench />);
    expect(screen.getByRole("tablist", { name: "Typ requestu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zapisz request" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Kopiuj jako cURL" }),
    ).toBeInTheDocument();
  });
});
