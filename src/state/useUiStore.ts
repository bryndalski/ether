import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "../lib/types";
import { DEFAULT_LOCALE, type Locale } from "../i18n";

export type ResponseDockPlacement = "bottom" | "right";

/** The top-level app mode: the request workbench, or the visual workflow editor. */
export type AppMode = "requests" | "workflows";

interface UiState {
  theme: Theme;
  locale: Locale;
  mode: AppMode;
  sidebarWidth: number;
  /** Collapsed collections rail: a narrow icon-only strip (⌘B toggles). The
   *  drag-resize handle only applies while expanded. Persisted. */
  sidebarCollapsed: boolean;
  responsePlacement: ResponseDockPlacement;
  /** Response dock height (percent of the editor column) when docked at bottom. */
  responseSize: number;
  /** Response dock width (px) when docked on the right. */
  responseWidth: number;
  /** GraphQL explorer column widths (px): field-tree (left) and docs (right).
   *  The middle editor column takes the remaining 1fr. Draggable + persisted. */
  gqlTreeWidth: number;
  gqlDocsWidth: number;
  /** Environment manager: the environments-list column width (px). Draggable. */
  envListWidth: number;
  /** True once the app has ever shown a response. Until then the idle response
   *  dock is a thin 44px "Ready" strip (Postman-style) instead of a 42% hero, so
   *  the request editor owns the screen while you build. Persisted. */
  responseSeen: boolean;
  paletteOpen: boolean;
  envManagerOpen: boolean;
  importOpen: boolean;
  devToolsOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setMode: (mode: AppMode) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setResponsePlacement: (placement: ResponseDockPlacement) => void;
  setResponseSize: (size: number) => void;
  setResponseWidth: (width: number) => void;
  setGqlTreeWidth: (width: number) => void;
  setGqlDocsWidth: (width: number) => void;
  setEnvListWidth: (width: number) => void;
  resetSidebarWidth: () => void;
  resetResponseSize: () => void;
  resetResponseWidth: () => void;
  resetGqlTreeWidth: () => void;
  resetGqlDocsWidth: () => void;
  resetEnvListWidth: () => void;
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
  markResponseSeen: () => void;

  // Local AI (Ollama). OFF by default — the kill-switch. When aiEnabled is
  // false the entire AI palette group is ABSENT (never a greyed row) and no
  // ai_* command is ever invoked. See docs/architecture/local-ai.md §1.5.
  aiEnabled: boolean;
  aiModel: string | null;
  setAiEnabled: (on: boolean) => void;
  setAiModel: (name: string | null) => void;
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 280;
// Response dock size bounds. Bottom dock is a percent of the editor column;
// right dock is an absolute pixel width. Default split is ~55/45 request/response.
const RESPONSE_SIZE_MIN = 20;
const RESPONSE_SIZE_MAX = 80;
const RESPONSE_SIZE_DEFAULT = 45;
const RESPONSE_WIDTH_MIN = 320;
const RESPONSE_WIDTH_MAX = 900;
const RESPONSE_WIDTH_DEFAULT = 480;
// GraphQL explorer side columns (px). The middle editor keeps the remaining 1fr.
const GQL_TREE_MIN = 200;
const GQL_TREE_MAX = 480;
const GQL_TREE_DEFAULT = 280;
const GQL_DOCS_MIN = 180;
const GQL_DOCS_MAX = 460;
const GQL_DOCS_DEFAULT = 260;
// Environment manager list column (px).
const ENV_LIST_MIN = 180;
const ENV_LIST_MAX = 420;
const ENV_LIST_DEFAULT = 240;

const clampBetween = (min: number, max: number) => (value: number) =>
  Math.min(max, Math.max(min, value));

function clampSidebar(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
}

function clampResponseSize(size: number): number {
  return Math.min(RESPONSE_SIZE_MAX, Math.max(RESPONSE_SIZE_MIN, size));
}

function clampResponseWidth(width: number): number {
  return Math.min(RESPONSE_WIDTH_MAX, Math.max(RESPONSE_WIDTH_MIN, width));
}

const clampGqlTree = clampBetween(GQL_TREE_MIN, GQL_TREE_MAX);
const clampGqlDocs = clampBetween(GQL_DOCS_MIN, GQL_DOCS_MAX);
const clampEnvList = clampBetween(ENV_LIST_MIN, ENV_LIST_MAX);

// Only durable UI preferences are persisted (localStorage `ether.ui`), scoped by
// the app container. `theme`, `locale` and the resizable layout dimensions
// (sidebar width, response dock placement/size/width) survive reloads; transient
// panel state (palette/import/devtools open) does not.
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      locale: DEFAULT_LOCALE,
      mode: "requests",
      sidebarWidth: SIDEBAR_DEFAULT,
      sidebarCollapsed: false,
      responsePlacement: "bottom",
      responseSize: RESPONSE_SIZE_DEFAULT,
      responseWidth: RESPONSE_WIDTH_DEFAULT,
      gqlTreeWidth: GQL_TREE_DEFAULT,
      gqlDocsWidth: GQL_DOCS_DEFAULT,
      envListWidth: ENV_LIST_DEFAULT,
      responseSeen: false,
      paletteOpen: false,
      envManagerOpen: false,
      importOpen: false,
      devToolsOpen: false,
      aiEnabled: false,
      aiModel: null,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setLocale: (locale) => set({ locale }),
      setMode: (mode) => set({ mode }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebar(width) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () =>
        set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setResponsePlacement: (responsePlacement) => set({ responsePlacement }),
      setResponseSize: (responseSize) =>
        set({ responseSize: clampResponseSize(responseSize) }),
      setResponseWidth: (responseWidth) =>
        set({ responseWidth: clampResponseWidth(responseWidth) }),
      setGqlTreeWidth: (width) => set({ gqlTreeWidth: clampGqlTree(width) }),
      setGqlDocsWidth: (width) => set({ gqlDocsWidth: clampGqlDocs(width) }),
      setEnvListWidth: (width) => set({ envListWidth: clampEnvList(width) }),
      resetSidebarWidth: () => set({ sidebarWidth: SIDEBAR_DEFAULT }),
      resetResponseSize: () => set({ responseSize: RESPONSE_SIZE_DEFAULT }),
      resetResponseWidth: () => set({ responseWidth: RESPONSE_WIDTH_DEFAULT }),
      resetGqlTreeWidth: () => set({ gqlTreeWidth: GQL_TREE_DEFAULT }),
      resetGqlDocsWidth: () => set({ gqlDocsWidth: GQL_DOCS_DEFAULT }),
      resetEnvListWidth: () => set({ envListWidth: ENV_LIST_DEFAULT }),
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
      markResponseSeen: () => {
        if (!get().responseSeen) set({ responseSeen: true });
      },
      // Flipping OFF is the instant, global, persistent kill-switch: the palette
      // group vanishes next render and no in-flight/future ai_* invoke can start
      // (the actions aren't even constructed). No teardown — the client is
      // request/response, not a persistent connection.
      setAiEnabled: (aiEnabled) => set({ aiEnabled }),
      setAiModel: (aiModel) => set({ aiModel }),
    }),
    {
      name: "ether.ui",
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        mode: state.mode,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        responsePlacement: state.responsePlacement,
        responseSize: state.responseSize,
        responseWidth: state.responseWidth,
        gqlTreeWidth: state.gqlTreeWidth,
        gqlDocsWidth: state.gqlDocsWidth,
        envListWidth: state.envListWidth,
        responseSeen: state.responseSeen,
        aiEnabled: state.aiEnabled,
        aiModel: state.aiModel,
      }),
    },
  ),
);
