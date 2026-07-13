import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useUiStore } from "../state/useUiStore";
import { useCollectionsStore } from "../state/useCollectionsStore";
import { useEnvStore } from "../state/useEnvStore";

// Every backend command rejects like the current Rust stubs ("not implemented"),
// so the shell must render its empty states rather than crash.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.reject("not implemented")),
}));

function resetStores() {
  useUiStore.setState({ theme: "dark", paletteOpen: false, locale: "en" });
  useCollectionsStore.setState({
    collections: [],
    requests: [],
    activeRequestId: null,
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
}

afterEach(() => {
  cleanup();
  resetStores();
});

describe("AppShell", () => {
  it("renders without crashing when the backend is not implemented", async () => {
    resetStores();
    render(<AppShell />);

    // Sidebar + workbench empty states from the "not implemented" backend.
    // With no active request the workbench (Zone 2+3) shows its own empty state;
    // the response dock nests inside it and only mounts once a request is open.
    await waitFor(() =>
      expect(screen.getByText("Send your first request")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Paste a curl or start with a GET"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Open command palette")).toBeInTheDocument();
  });

  it("opens the command palette on ⌘K", async () => {
    resetStores();
    render(<AppShell />);

    expect(useUiStore.getState().paletteOpen).toBe(false);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUiStore.getState().paletteOpen).toBe(true);

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("Search requests, actions, env…"),
      ).toBeInTheDocument(),
    );
    // "Toggle theme" is unique to the palette, proving its action list rendered.
    expect(screen.getByText("Toggle theme")).toBeInTheDocument();
  });

  it("runs a palette action and closes the palette", async () => {
    resetStores();
    render(<AppShell />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const toggle = await screen.findByText("Toggle theme");

    expect(useUiStore.getState().theme).toBe("dark");
    fireEvent.click(toggle);

    expect(useUiStore.getState().theme).toBe("light");
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });
});
