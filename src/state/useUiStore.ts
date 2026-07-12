import { create } from "zustand";
import type { Theme } from "../lib/types";

export type ResponseDockPlacement = "bottom" | "right";

interface UiState {
  theme: Theme;
  sidebarWidth: number;
  responsePlacement: ResponseDockPlacement;
  responseSize: number;
  paletteOpen: boolean;
  envManagerOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  setResponsePlacement: (placement: ResponseDockPlacement) => void;
  setResponseSize: (size: number) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openEnvManager: () => void;
  closeEnvManager: () => void;
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;

function clampSidebar(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: "dark",
  sidebarWidth: 260,
  responsePlacement: "bottom",
  responseSize: 42,
  paletteOpen: false,
  envManagerOpen: false,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
  setSidebarWidth: (width) => set({ sidebarWidth: clampSidebar(width) }),
  setResponsePlacement: (responsePlacement) => set({ responsePlacement }),
  setResponseSize: (responseSize) => set({ responseSize }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set({ paletteOpen: !get().paletteOpen }),
  openEnvManager: () => set({ envManagerOpen: true }),
  closeEnvManager: () => set({ envManagerOpen: false }),
}));
