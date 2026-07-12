// Pure ⌘K action registry. Given the live context, returns a flat list of
// PaletteAction descriptors whose `run` closures call the injected store/IPC
// path (never a private re-implementation). No React, no module-scope effects —
// so the whole registry is unit-testable in isolation.

import type { Environment } from "./types";

export type PaletteGroup = "Request" | "Environments" | "Tools" | "View";

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
  runBenchmark: () => void;
  toggleTheme: () => void;
}

export function buildPaletteActions(ctx: PaletteContext): PaletteAction[] {
  const envRows: PaletteAction[] = ctx.environments.map((environment) => ({
    id: `env-switch-${environment.id}`,
    group: "Environments",
    label: `Przełącz środowisko → ${environment.name}`,
    keywords: ["env", "środowisko", environment.name],
    active: environment.id === ctx.activeEnvironmentId,
    run: () => ctx.switchEnvironment(environment.id),
  }));

  return [
    {
      id: "new-request",
      group: "Request",
      label: "Nowy request",
      shortcut: "⌘N",
      keywords: ["new", "nowy"],
      run: ctx.newRequest,
    },
    {
      id: "save-request",
      group: "Request",
      label: "Zapisz request",
      shortcut: "⌘S",
      keywords: ["save", "zapisz"],
      disabled: !ctx.dirty,
      run: ctx.saveRequest,
    },
    {
      id: "send-request",
      group: "Request",
      label: "Wyślij",
      shortcut: "⌘↵",
      keywords: ["send", "wyślij", "run"],
      disabled: !ctx.canSend,
      run: ctx.sendRequest,
    },
    {
      id: "copy-as-curl",
      group: "Request",
      label: "Kopiuj jako cURL",
      shortcut: "⌘⇧C",
      keywords: ["curl", "kopiuj", "copy"],
      disabled: !ctx.activeRequestPresent,
      run: ctx.copyAsCurl,
    },
    ...envRows,
    {
      id: "open-env-manager",
      group: "Environments",
      label: "Otwórz menedżer środowisk",
      keywords: ["env", "środowiska", "manager"],
      run: ctx.openEnvManager,
    },
    {
      id: "open-import",
      group: "Tools",
      label: "Importuj…",
      shortcut: "⌘I",
      keywords: ["import", "postman", "insomnia", "har", "curl"],
      run: ctx.openImport,
    },
    {
      id: "open-history",
      group: "Tools",
      label: "Historia",
      shortcut: "⌘Y",
      keywords: ["history", "historia"],
      run: ctx.openHistory,
    },
    {
      id: "run-benchmark",
      group: "Tools",
      label: "Uruchom benchmark",
      keywords: ["benchmark", "bench"],
      disabled: !ctx.canSend,
      run: ctx.runBenchmark,
    },
    {
      id: "toggle-theme",
      group: "View",
      label: "Przełącz motyw",
      keywords: ["theme", "motyw", "dark", "light"],
      run: ctx.toggleTheme,
    },
  ];
}

export const PALETTE_GROUP_ORDER: PaletteGroup[] = [
  "Request",
  "Environments",
  "Tools",
  "View",
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
