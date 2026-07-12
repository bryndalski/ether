import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { EnvPill } from "./EnvPill";
import { useEnvStore } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import type { Environment } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

function env(
  id: string,
  name: string,
  parent_id: string | null = null,
  variables: [string, string][] = [],
  secret_names: string[] = [],
): Environment {
  return {
    id,
    name,
    parent_id,
    color: null,
    variables: variables.map(([n, v]) => ({ name: n, value: v, enabled: true })),
    secret_names,
  };
}

describe("EnvPill env switch + QuickLook", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    useEnvStore.setState({
      environments: [env("local", "local"), env("prod", "prod")],
      activeEnvironmentId: "local",
      loading: false,
      loadFailed: false,
    });
    useUiStore.setState({ envManagerOpen: false });
  });

  it("switching an env optimistically updates and calls set_active_environment", () => {
    render(<EnvPill />);
    fireEvent.click(screen.getByRole("button", { name: /local/i }));
    fireEvent.click(screen.getByRole("option", { name: /prod/i }));

    expect(useEnvStore.getState().activeEnvironmentId).toBe("prod");
    expect(invokeMock).toHaveBeenCalledWith("set_active_environment", {
      id: "prod",
    });
  });

  it("the dropdown footer opens the environment manager", () => {
    render(<EnvPill />);
    fireEvent.click(screen.getByRole("button", { name: /local/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /zarządzaj środowiskami/i }),
    );
    expect(useUiStore.getState().envManagerOpen).toBe(true);
  });

  it("QuickLook shows merged inherited vars and masks secrets (value never in DOM)", () => {
    useEnvStore.setState({
      environments: [
        env("base", "base", null, [["host", "api.base"]], ["TOKEN"]),
        env("sub", "sub", "base", [["host", "api.sub"]]),
      ],
      activeEnvironmentId: "sub",
    });
    render(<EnvPill />);
    // Hover reveals the quick-look popover for the active env.
    fireEvent.mouseEnter(screen.getByText("sub").closest("div")!);

    const popover = screen.getByRole("dialog", {
      name: /zmienne środowiska sub/i,
    });
    // Child override wins for host.
    expect(popover).toHaveTextContent("api.sub");
    expect(popover).not.toHaveTextContent("api.base");
    // Secret is masked; its name shows but never a value.
    expect(popover).toHaveTextContent("TOKEN");
    expect(popover).toHaveTextContent("••••••••");
  });
});
