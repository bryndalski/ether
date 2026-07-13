import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { GraphqlExplorer } from "./GraphqlExplorer";
import { useRequestDraft } from "../../hooks/useRequestDraft";
import { sdlEnvelope } from "../../lib/graphqlIntrospection";
import { useSendRequest } from "../../hooks/useSendRequest";
import type { StoredRequest } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../state/useEnvStore", () => ({
  useEnvStore: (selector: (s: { activeEnvironmentId: string | null }) => unknown) =>
    selector({ activeEnvironmentId: "env-dev" }),
}));

// CodeMirror is heavy in jsdom; stub it to a controlled textarea so the
// edit->checkbox path is exercised without the full editor.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange, "aria-label": ariaLabel }: {
    value: string;
    onChange: (v: string) => void;
    "aria-label"?: string;
  }) => (
    <textarea
      aria-label={ariaLabel ?? "editor"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("cm6-graphql", () => ({ graphql: () => [] }));

const mockInvoke = vi.mocked(invoke);

const SDL = `
type Query { user(id: ID): User users(page: Int): [User!] }
type User { id: ID! name: String email: String createdAt: String roles: [Role!] }
type Role { name: String }
`;

function seed(): StoredRequest {
  return {
    id: "r1",
    collection_id: "c1",
    name: "gql",
    method: "POST",
    url: "https://api.duotio.com/graphql",
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
    assertions: [],
  };
}

function Harness() {
  const { draft, dispatch } = useRequestDraft(seed());
  const { sendState } = useSendRequest();
  const [runs, setRuns] = useState(0);
  return (
    <div>
      <span data-testid="query">{draft.graphql?.query ?? ""}</span>
      <span data-testid="runs">{runs}</span>
      <GraphqlExplorer
        draft={draft}
        dispatch={dispatch}
        sendState={sendState}
        onRun={() => setRuns((n) => n + 1)}
        onCancel={() => {}}
      />
    </div>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  // The Explorer hydrates from the cache on open — serve an SDL sentinel so a
  // real GraphQLSchema drives the tree/docs without a network introspection.
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "gql_schema_get") return Promise.resolve(sdlEnvelope(SDL.trim()));
    return Promise.resolve(undefined);
  });
});
afterEach(() => vi.clearAllMocks());

describe("GraphqlExplorer", () => {
  it("renders a real role=tree with treeitems once the schema loads", async () => {
    render(<Harness />);
    const tree = await screen.findByRole("tree");
    await waitFor(() =>
      expect(within(tree).getAllByRole("treeitem").length).toBeGreaterThan(0),
    );
  });

  it("checking a field writes it into the query (tree -> query)", async () => {
    render(<Harness />);
    await screen.findByRole("tree");

    fireEvent.click(screen.getByLabelText("Zaznacz pole user"));

    await waitFor(() =>
      expect(screen.getByTestId("query").textContent).toContain("user"),
    );
  });

  it("typing a query checks the matching checkboxes (edit -> tree)", async () => {
    render(<Harness />);
    await screen.findByRole("tree");

    const editorRegion = screen.getByLabelText("Edytor zapytania GraphQL");
    const editor = editorRegion.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "query { user { id } }" } });

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Zaznacz pole user") as HTMLInputElement).checked,
      ).toBe(true),
    );
    expect(
      (screen.getByLabelText("Zaznacz pole users") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("op-picker exposes an accessible operation select", async () => {
    render(<Harness />);
    await screen.findByRole("tree");
    expect(screen.getByLabelText("Typ operacji GraphQL")).toBeInTheDocument();
  });

  it("Run and Refresh icon-only buttons expose accessible names", async () => {
    render(<Harness />);
    await screen.findByRole("tree");
    expect(
      screen.getByRole("button", { name: "Uruchom operację GraphQL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Odśwież schemat" }),
    ).toBeInTheDocument();
  });

  it("clicking a field type in docs drills into that type", async () => {
    render(<Harness />);
    await screen.findByRole("tree");

    // The docs panel opens on the root Query type; drill into the User type.
    const typeButton = await screen.findByRole("button", { name: "User" });
    fireEvent.click(typeButton);

    await waitFor(() =>
      expect(screen.getByText("type User")).toBeInTheDocument(),
    );
  });

  it("schema health in the statusbar pairs the dot with a text label", async () => {
    render(<Harness />);
    await screen.findByRole("tree");
    // SDL fallback => "SDL schema · N types" text present (never color-only)
    await waitFor(() =>
      expect(screen.getByText(/SDL schema · \d+ types/)).toBeInTheDocument(),
    );
  });

  it("Run invokes the onRun callback when a query is present", async () => {
    render(<Harness />);
    await screen.findByRole("tree");

    fireEvent.click(screen.getByLabelText("Zaznacz pole user"));

    const run = screen.getByRole("button", { name: "Uruchom operację GraphQL" });
    await waitFor(() => expect(run).not.toBeDisabled());
    fireEvent.click(run);
    expect(screen.getByTestId("runs").textContent).toBe("1");
  });
});
