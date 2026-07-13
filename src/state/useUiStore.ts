import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "../lib/types";
import { DEFAULT_LOCALE, type Locale } from "../i18n";

export type ResponseDockPlacement = "bottom" | "right";

interface UiState {
  theme: Theme;
  locale: Locale;
  sidebarWidth: number;
  responsePlacement: ResponseDockPlacement;
  responseSize: number;
  paletteOpen: boolean;
  envManagerOpen: boolean;
  importOpen: boolean;
  devToolsOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setSidebarWidth: (width: number) => void;
  setResponsePlacement: (placement: ResponseDockPlacement) => void;
  setResponseSize: (size: number) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openEnvManager: () => void;
  closeEnvManager: () => void;
  openImport: () => void;
  closeImport: () => void;
  openDevTools: () => void;
  closeDevTools: () => void;
  toggleDevTools: () => void;
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;

function clampSidebar(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
}

// Only durable UI preferences are persisted (localStorage `ether.ui`), scoped by
// the app container. `theme` + `locale` survive reloads; transient panel state
// (palette/import/devtools open) does not.
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      locale: DEFAULT_LOCALE,
      sidebarWidth: 260,
      responsePlacement: "bottom",
      responseSize: 42,
      paletteOpen: false,
      envManagerOpen: false,
      importOpen: false,
      devToolsOpen: false,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setLocale: (locale) => set({ locale }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebar(width) }),
      setResponsePlacement: (responsePlacement) => set({ responsePlacement }),
      setResponseSize: (responseSize) => set({ responseSize }),
      openPalette: () => set({ paletteOpen: true }),
      closePalette: () => set({ paletteOpen: false }),
      togglePalette: () => set({ paletteOpen: !get().paletteOpen }),
      openEnvManager: () => set({ envManagerOpen: true }),
      closeEnvManager: () => set({ envManagerOpen: false }),
      openImport: () => set({ importOpen: true }),
      closeImport: () => set({ importOpen: false }),
      openDevTools: () => set({ devToolsOpen: true }),
      closeDevTools: () => set({ devToolsOpen: false }),
      toggleDevTools: () => set({ devToolsOpen: !get().devToolsOpen }),
    }),
    {
      name: "ether.ui",
      partialize: (state) => ({ theme: state.theme, locale: state.locale }),
    },
  ),
);
