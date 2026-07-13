import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import { useSidebarTree } from "../../hooks/useSidebarTree";
import { RequestWorkbench } from "../workbench/RequestWorkbench";
import { CollectionTree } from "./CollectionTree";
import type { Collection, StoredRequest } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// The URL bar is now a single-line CodeMirror; stub it to a plain input so the
// seeded draft URL is readable as an input value.
vi.mock("../common/SingleLineCodeInput", () => ({
  SingleLineCodeInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

function col(id: string, name: string): Collection {
  return { id, name, parent_id: null, sort_order: 0, docs_md: null };
}

function req(
  id: string,
  collection_id: string,
  name: string,
  method: string,
  url: string,
): StoredRequest {
  return {
    id,
    collection_id,
    name,
    method,
    url,
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
    graphql: null,
    assertions: [],
  };
}

function TreeHarness() {
  const view = useSidebarTree();
  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  return <CollectionTree view={view} activeRequestId={activeRequestId} />;
}

describe("CollectionTree render + load-request contract", () => {
  beforeEach(() => {
    useCollectionsStore.setState({
      collections: [col("api", "Duotio API")],
      requests: [
        req("r1", "api", "List users", "GET", "https://api/users"),
        req("r2", "api", "Create user", "POST", "https://api/create"),
      ],
      activeRequestId: null,
      loading: false,
      loadError: null,
      loadFailed: false,
    });
    useEnvStore.setState({ environments: [], activeEnvironmentId: null });
  });

  it("renders folders and request rows with their method labels", () => {
    render(<TreeHarness />);
    expect(screen.getByText("Duotio API")).toBeInTheDocument();
    expect(screen.getByText("List users")).toBeInTheDocument();
    // MethodBadge shows the verb text (never color-only).
    expect(screen.getAllByText("GET").length).toBeGreaterThan(0);
    expect(screen.getByText("POST")).toBeInTheDocument();
  });

  it("exposes aria-expanded on folder rows (a11y)", () => {
    render(<TreeHarness />);
    const folder = screen.getByText("Duotio API").closest('[role="treeitem"]')!;
    expect(folder).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking a request selects it and seeds the workbench draft (§5 contract)", () => {
    render(
      <>
        <TreeHarness />
        <RequestWorkbench />
      </>,
    );
    // Before selection the workbench shows the empty state.
    expect(useCollectionsStore.getState().activeRequestId).toBeNull();

    fireEvent.click(screen.getByText("List users"));

    // Store-driven selection is the single source of truth.
    expect(useCollectionsStore.getState().activeRequestId).toBe("r1");
    // The draft re-seeds → the URL of the selected request appears in the editor.
    const urlInput = screen.getByLabelText("Request URL") as HTMLInputElement;
    expect(urlInput.value).toBe("https://api/users");
  });
});
