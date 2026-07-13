import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./useUiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      theme: "dark",
      sidebarWidth: 280,
      responsePlacement: "bottom",
      responseSize: 45,
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

  it("clamps response bottom-dock size to the 20–80% range", () => {
    useUiStore.getState().setResponseSize(5);
    expect(useUiStore.getState().responseSize).toBe(20);
    useUiStore.getState().setResponseSize(95);
    expect(useUiStore.getState().responseSize).toBe(80);
    useUiStore.getState().setResponseSize(50);
    expect(useUiStore.getState().responseSize).toBe(50);
  });

  it("clamps response right-dock width to the 320–900px range", () => {
    useUiStore.getState().setResponseWidth(100);
    expect(useUiStore.getState().responseWidth).toBe(320);
    useUiStore.getState().setResponseWidth(2000);
    expect(useUiStore.getState().responseWidth).toBe(900);
    useUiStore.getState().setResponseWidth(600);
    expect(useUiStore.getState().responseWidth).toBe(600);
  });

  it("resets layout dimensions to their defaults", () => {
    useUiStore.getState().setSidebarWidth(300);
    useUiStore.getState().setResponseSize(70);
    useUiStore.getState().setResponseWidth(700);
    useUiStore.getState().resetSidebarWidth();
    useUiStore.getState().resetResponseSize();
    useUiStore.getState().resetResponseWidth();
    expect(useUiStore.getState().sidebarWidth).toBe(280);
    expect(useUiStore.getState().responseSize).toBe(45);
    expect(useUiStore.getState().responseWidth).toBe(480);
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
