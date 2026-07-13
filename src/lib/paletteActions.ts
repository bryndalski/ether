// Pure ⌘K action registry. Given the live context, returns a flat list of
// PaletteAction descriptors whose `run` closures call the injected store/IPC
// path (never a private re-implementation). No React, no module-scope effects —
// so the whole registry is unit-testable in isolation. Labels are localized via
// the injected `t` translator so the palette follows the active language.

import type { Environment } from "./types";
import type { Locale } from "../i18n";
import type { TranslateFn } from "../i18n/useT";

export type PaletteGroup = "Request" | "Environments" | "Tools" | "View" | "AI";

export interface PaletteAction {
  id: string;
  group: PaletteGroup;
  label: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  active?: boolean;
  run: () => void;
}

export interface PaletteContext {
  t: TranslateFn;
  locale: Locale;
  environments: Environment[];
  activeEnvironmentId: string | null;
  activeRequestPresent: boolean;
  dirty: boolean;
  canSend: boolean;

  newRequest: () => void;
  saveRequest: () => void;
  sendRequest: () => void;
  copyAsCurl: () => void;
  switchEnvironment: (id: string) => void;
  openEnvManager: () => void;
  openImport: () => void;
  openHistory: () => void;
  openDevTools: () => void;
  runBenchmark: () => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  setLocale: (locale: Locale) => void;

  // Local AI. The five ai-* actions are built ONLY when aiEnabled && aiModel is
  // set — otherwise the entire "AI" group is absent (off-by-default kill-switch).
  aiEnabled: boolean;
  aiModel: string | null;
  aiExplainError: () => void;
  aiGenerateAssertions: () => void;
  aiNlToRequest: () => void;
  aiNlToGraphql: () => void;
  aiDocumentRequest: () => void;
}

/** The five AI actions, built only when AI is opted-in AND a model is chosen.
 *  Absent (not greyed) otherwise — so a user who never opts in never sees them. */
function buildAiActions(ctx: PaletteContext): PaletteAction[] {
  const { t } = ctx;
  if (!ctx.aiEnabled || ctx.aiModel === null) return [];

  return [
    {
      id: "ai-explain-error",
      group: "AI",
      label: t("ai.actionExplainError"),
      keywords: ["ai", "explain", "error", "diagnose", "local"],
      disabled: !ctx.activeRequestPresent,
      run: ctx.aiExplainError,
    },
    {
      id: "ai-generate-assertions",
      group: "AI",
      label: t("ai.actionGenerateAssertions"),
      keywords: ["ai", "assert", "test", "local"],
      disabled: !ctx.activeRequestPresent,
      run: ctx.aiGenerateAssertions,
    },
    {
      id: "ai-nl-to-request",
      group: "AI",
      label: t("ai.actionNlToRequest"),
      keywords: ["ai", "request", "describe", "generate", "local"],
      run: ctx.aiNlToRequest,
    },
    {
      id: "ai-nl-to-graphql",
      group: "AI",
      label: t("ai.actionNlToGraphql"),
      keywords: ["ai", "graphql", "query", "local"],
      run: ctx.aiNlToGraphql,
    },
    {
      id: "ai-document-request",
      group: "AI",
      label: t("ai.actionDocumentRequest"),
      keywords: ["ai", "document", "docs", "local"],
      disabled: !ctx.activeRequestPresent,
      run: ctx.aiDocumentRequest,
    },
  ];
}

export function buildPaletteActions(ctx: PaletteContext): PaletteAction[] {
  const { t } = ctx;

  const envRows: PaletteAction[] = ctx.environments.map((environment) => ({
    id: `env-switch-${environment.id}`,
    group: "Environments",
    label: t("palette.switchEnvironment", { name: environment.name }),
    keywords: ["env", "środowisko", "environment", environment.name],
    active: environment.id === ctx.activeEnvironmentId,
    run: () => ctx.switchEnvironment(environment.id),
  }));

  return [
    {
      id: "new-request",
      group: "Request",
      label: t("palette.newRequest"),
      shortcut: "⌘N",
      keywords: ["new", "nowy"],
      run: ctx.newRequest,
    },
    {
      id: "save-request",
      group: "Request",
      label: t("palette.saveRequest"),
      shortcut: "⌘S",
      keywords: ["save", "zapisz"],
      disabled: !ctx.dirty,
      run: ctx.saveRequest,
    },
    {
      id: "send-request",
      group: "Request",
      label: t("palette.send"),
      shortcut: "⌘↵",
      keywords: ["send", "wyślij", "run"],
      disabled: !ctx.canSend,
      run: ctx.sendRequest,
    },
    {
      id: "copy-as-curl",
      group: "Request",
      label: t("palette.copyAsCurl"),
      shortcut: "⌘⇧C",
      keywords: ["curl", "kopiuj", "copy"],
      disabled: !ctx.activeRequestPresent,
      run: ctx.copyAsCurl,
    },
    ...envRows,
    {
      id: "open-env-manager",
      group: "Environments",
      label: t("palette.openEnvManager"),
      keywords: ["env", "środowiska", "manager"],
      run: ctx.openEnvManager,
    },
    {
      id: "open-import",
      group: "Tools",
      label: t("palette.import"),
      shortcut: "⌘I",
      keywords: ["import", "postman", "insomnia", "har", "curl"],
      run: ctx.openImport,
    },
    {
      id: "open-history",
      group: "Tools",
      label: t("palette.history"),
      shortcut: "⌘Y",
      keywords: ["history", "historia"],
      run: ctx.openHistory,
    },
    {
      id: "run-benchmark",
      group: "Tools",
      label: t("palette.runBenchmark"),
      keywords: ["benchmark", "bench"],
      disabled: !ctx.canSend,
      run: ctx.runBenchmark,
    },
    {
      id: "open-devtools",
      group: "Tools",
      label: t("devtools.openDevTools"),
      keywords: ["devtools", "dev tools", "jwt", "decoder", "narzędzia"],
      run: ctx.openDevTools,
    },
    {
      id: "toggle-theme",
      group: "View",
      label: t("palette.toggleTheme"),
      keywords: ["theme", "motyw", "dark", "light"],
      run: ctx.toggleTheme,
    },
    {
      id: "toggle-sidebar",
      group: "View",
      label: ctx.sidebarCollapsed
        ? t("palette.expandSidebar")
        : t("palette.collapseSidebar"),
      shortcut: "⌘B",
      keywords: ["sidebar", "panel", "collapse", "zwiń", "rozwiń", "boczny"],
      run: ctx.toggleSidebar,
    },
    {
      id: "language-en",
      group: "View",
      label: t("palette.languageEnglish"),
      keywords: ["language", "english", "język", "en"],
      active: ctx.locale === "en",
      run: () => ctx.setLocale("en"),
    },
    {
      id: "language-pl",
      group: "View",
      label: t("palette.languagePolish"),
      keywords: ["language", "polski", "polish", "język", "pl"],
      active: ctx.locale === "pl",
      run: () => ctx.setLocale("pl"),
    },
    ...buildAiActions(ctx),
  ];
}

export const PALETTE_GROUP_ORDER: PaletteGroup[] = [
  "Request",
  "Environments",
  "Tools",
  "View",
  "AI",
];

/** Group actions preserving PALETTE_GROUP_ORDER, dropping empty groups. */
export function groupPaletteActions(
  actions: PaletteAction[],
): { group: PaletteGroup; actions: PaletteAction[] }[] {
  return PALETTE_GROUP_ORDER.map((group) => ({
    group,
    actions: actions.filter((action) => action.group === group),
  })).filter((entry) => entry.actions.length > 0);
}
