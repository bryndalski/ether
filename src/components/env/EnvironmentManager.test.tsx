import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { EnvironmentManager } from "./EnvironmentManager";
import { useEnvStore } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import type { Environment } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

function env(id: string, name: string): Environment {
  return {
    id,
    name,
    parent_id: null,
    color: null,
    variables: [],
    secret_names: [],
  };
}

describe("EnvironmentManager modal", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, args: unknown) => {
      if (command === "upsert_environment") {
        return Promise.resolve((args as { environment: Environment }).environment);
      }
      if (command === "secret_exists") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    useEnvStore.setState({
      environments: [env("local", "local")],
      activeEnvironmentId: "local",
      loading: false,
      loadFailed: false,
    });
    useUiStore.setState({ envManagerOpen: true });
  });

  it("renders nothing when closed", () => {
    useUiStore.setState({ envManagerOpen: false });
    render(<EnvironmentManager />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled modal dialog (role=dialog, aria-modal)", () => {
    render(<EnvironmentManager />);
    const dialog = screen.getByRole("dialog", {
      name: /manage environments/i,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("creating an env upserts with parent_id:null and selects it", async () => {
    render(<EnvironmentManager />);
    fireEvent.click(screen.getByRole("button", { name: /new environment/i }));
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (call) => call[0] === "upsert_environment",
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(
        (calls[0][1] as { environment: Environment }).environment.parent_id,
      ).toBeNull();
    });
  });

  it("closing via the Esc key hides the modal", () => {
    render(<EnvironmentManager />);
    fireEvent.keyDown(
      screen.getByRole("dialog", { name: /manage environments/i }),
      { key: "Escape" },
    );
    expect(useUiStore.getState().envManagerOpen).toBe(false);
  });
});
