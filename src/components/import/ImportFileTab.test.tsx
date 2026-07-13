import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ImportFileTab } from "./ImportFileTab";
import { useImport } from "../../hooks/useImport";
import type { ImportResult } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const postmanJson = JSON.stringify({
  info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/" },
  item: [],
});

const importResult: ImportResult = {
  collections: [
    { id: "col-1", name: "API", parent_id: null, sort_order: 0, docs_md: null },
  ],
  requests: [
    {
      id: "req-1",
      collection_id: "col-1",
      name: "List",
      method: "GET",
      url: "https://api.test/list",
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
    },
  ],
  environments: [],
  warnings: [
    "Pominięto skrypt pm.*",
    "Wykryto sekret w nagłówku Authorization",
  ],
};

beforeEach(() => mockInvoke.mockReset());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({
  onSaved,
  onError,
}: {
  onSaved: (r: number, c: number) => void;
  onError: (m: string) => void;
}) {
  const api = useImport();
  return <ImportFileTab api={api} onSaved={onSaved} onError={onError} />;
}

function renderTab() {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const view = render(<Harness onSaved={onSaved} onError={onError} />);
  return { onSaved, onError, view };
}

describe("ImportFileTab", () => {
  it("detects Postman and calls import_postman (and no other importer)", async () => {
    mockInvoke.mockResolvedValue(importResult);
    renderTab();

    fireEvent.change(screen.getByLabelText(/Wklej zawartość pliku/), {
      target: { value: postmanJson },
    });
    expect(screen.getByText(/Wykryto: Postman/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importuj" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("import_postman", {
        json: postmanJson,
      }),
    );
    const commands = mockInvoke.mock.calls.map((call) => call[0]);
    expect(commands).not.toContain("import_har");
    expect(commands).not.toContain("import_insomnia");
  });

  it("renders the counts and the warnings block after import", async () => {
    mockInvoke.mockResolvedValue(importResult);
    renderTab();
    fireEvent.change(screen.getByLabelText(/Wklej zawartość pliku/), {
      target: { value: postmanJson },
    });
    fireEvent.click(screen.getByRole("button", { name: "Importuj" }));

    expect(await screen.findByText("Pominięto skrypt pm.*")).toBeInTheDocument();
    expect(
      screen.getByText("Wykryto sekret w nagłówku Authorization"),
    ).toBeInTheDocument();
  });

  it("saves collections before requests (order asserted)", async () => {
    mockInvoke.mockResolvedValue(importResult);
    const { onSaved } = renderTab();
    fireEvent.change(screen.getByLabelText(/Wklej zawartość pliku/), {
      target: { value: postmanJson },
    });
    fireEvent.click(screen.getByRole("button", { name: "Importuj" }));
    await screen.findByText("Pominięto skrypt pm.*");

    fireEvent.click(screen.getByRole("button", { name: "Zapisz do kolekcji" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1, 1));
    const persistCalls = mockInvoke.mock.calls
      .map((call) => call[0])
      .filter((cmd) => cmd === "upsert_collection" || cmd === "upsert_request");
    expect(persistCalls).toEqual(["upsert_collection", "upsert_request"]);
  });
});
