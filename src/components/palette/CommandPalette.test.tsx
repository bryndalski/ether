import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { CommandPalette } from "./CommandPalette";
import { useUiStore } from "../../state/useUiStore";
import { useEnvStore } from "../../state/useEnvStore";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useWorkbenchActions } from "../../state/useWorkbenchActions";
import { useHistoryStore } from "../../state/useHistoryStore";
import type { Environment } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const environments: Environment[] = [
  {
    id: "env-prod",
    name: "Prod",
    parent_id: null,
    color: null,
    variables: [],
    secret_names: [],
  },
];

function openPalette() {
  useUiStore.setState({ paletteOpen: true });
  useEnvStore.setState({
    environments,
    activeEnvironmentId: "env-prod",
    loading: false,
    loadFailed: false,
  });
  useCollectionsStore.setState({
    collections: [],
    requests: [],
    activeRequestId: "req-1",
    loading: false,
    loadError: null,
    loadFailed: false,
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  useWorkbenchActions.getState().reset();
});
afterEach(() => {
  cleanup();
  useUiStore.setState({ paletteOpen: false, locale: "en" });
  vi.clearAllMocks();
});

describe("CommandPalette", () => {
  it("renders as a dialog with grouped, real actions", () => {
    openPalette();
    render(<CommandPalette />);
    expect(
      screen.getByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();
    expect(screen.getByText("New request")).toBeInTheDocument();
    expect(screen.getByText("Import…")).toBeInTheDocument();
    expect(screen.getByText("Copy as cURL")).toBeInTheDocument();
  });

  it("'Import…' opens the import modal via the ui store", () => {
    openPalette();
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Import…"));
    expect(useUiStore.getState().importOpen).toBe(true);
  });

  it("'Switch environment → Prod' switches the env via set_active_environment", async () => {
    openPalette();
    mockInvoke.mockResolvedValue(undefined);
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Switch environment → Prod"));
    expect(mockInvoke).toHaveBeenCalledWith("set_active_environment", {
      id: "env-prod",
    });
  });

  it("'Save request' invokes the workbench-bus save closure", () => {
    openPalette();
    const save = vi.fn();
    useWorkbenchActions.getState().register({ save, canSave: true });
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Save request"));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("'History' opens the history drawer", () => {
    openPalette();
    useHistoryStore.setState({ drawerOpen: false });
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("History"));
    expect(useHistoryStore.getState().drawerOpen).toBe(true);
  });

  it("switches the app language to Polish from the palette", () => {
    openPalette();
    useUiStore.setState({ locale: "en" });
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Language: Polski"));
    expect(useUiStore.getState().locale).toBe("pl");
  });
});
