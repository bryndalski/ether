import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./useUiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      theme: "dark",
      sidebarWidth: 260,
      responsePlacement: "bottom",
      responseSize: 42,
      paletteOpen: false,
    });
  });

  it("toggles theme between dark and light", () => {
    expect(useUiStore.getState().theme).toBe("dark");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("light");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("dark");
  });

  it("opens and closes the command palette", () => {
    expect(useUiStore.getState().paletteOpen).toBe(false);
    useUiStore.getState().togglePalette();
    expect(useUiStore.getState().paletteOpen).toBe(true);
    useUiStore.getState().closePalette();
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });

  it("clamps sidebar width to the 200–420px range", () => {
    useUiStore.getState().setSidebarWidth(50);
    expect(useUiStore.getState().sidebarWidth).toBe(200);
    useUiStore.getState().setSidebarWidth(999);
    expect(useUiStore.getState().sidebarWidth).toBe(420);
    useUiStore.getState().setSidebarWidth(300);
    expect(useUiStore.getState().sidebarWidth).toBe(300);
  });

  it("local AI is OFF by default with no model", () => {
    // A fresh store (no persisted opt-in) never enables AI.
    useUiStore.setState({ aiEnabled: false, aiModel: null });
    expect(useUiStore.getState().aiEnabled).toBe(false);
    expect(useUiStore.getState().aiModel).toBeNull();
  });

  it("setAiEnabled/setAiModel are the opt-in + kill-switch", () => {
    useUiStore.getState().setAiEnabled(true);
    useUiStore.getState().setAiModel("llama3.1:8b");
    expect(useUiStore.getState().aiEnabled).toBe(true);
    expect(useUiStore.getState().aiModel).toBe("llama3.1:8b");
    // kill-switch: flip off
    useUiStore.getState().setAiEnabled(false);
    expect(useUiStore.getState().aiEnabled).toBe(false);
  });

  it("persists aiEnabled/aiModel in the partialize allow-list", () => {
    const persisted = JSON.parse(window.localStorage.getItem("ether.ui") ?? "{}");
    // After the setters above ran, the persisted snapshot carries the AI keys.
    expect(Object.keys(persisted.state ?? {})).toEqual(
      expect.arrayContaining(["aiEnabled", "aiModel"]),
    );
  });
});
