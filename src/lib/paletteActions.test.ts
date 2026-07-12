import { describe, expect, it, vi } from "vitest";
import {
  buildPaletteActions,
  groupPaletteActions,
  type PaletteContext,
} from "./paletteActions";
import type { Environment } from "./types";

const environments: Environment[] = [
  {
    id: "env-dev",
    name: "Dev",
    parent_id: null,
    color: null,
    variables: [],
    secret_names: [],
  },
  {
    id: "env-prod",
    name: "Prod",
    parent_id: null,
    color: null,
    variables: [],
    secret_names: [],
  },
];

function makeCtx(overrides: Partial<PaletteContext> = {}): PaletteContext {
  return {
    environments,
    activeEnvironmentId: "env-dev",
    activeRequestPresent: true,
    dirty: true,
    canSend: true,
    newRequest: vi.fn(),
    saveRequest: vi.fn(),
    sendRequest: vi.fn(),
    copyAsCurl: vi.fn(),
    switchEnvironment: vi.fn(),
    openEnvManager: vi.fn(),
    openImport: vi.fn(),
    openHistory: vi.fn(),
    runBenchmark: vi.fn(),
    toggleTheme: vi.fn(),
    ...overrides,
  };
}

describe("buildPaletteActions", () => {
  it("includes every core action id", () => {
    const ids = buildPaletteActions(makeCtx()).map((action) => action.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "new-request",
        "save-request",
        "send-request",
        "copy-as-curl",
        "open-env-manager",
        "open-import",
        "open-history",
        "run-benchmark",
        "toggle-theme",
      ]),
    );
  });

  it("emits one row per environment and marks the active one", () => {
    const envRows = buildPaletteActions(makeCtx()).filter((action) =>
      action.id.startsWith("env-switch-"),
    );
    expect(envRows).toHaveLength(2);
    expect(envRows.find((r) => r.id === "env-switch-env-dev")?.active).toBe(true);
    expect(envRows.find((r) => r.id === "env-switch-env-prod")?.active).toBe(
      false,
    );
  });

  it("disables Save when not dirty", () => {
    const actions = buildPaletteActions(makeCtx({ dirty: false }));
    expect(actions.find((a) => a.id === "save-request")?.disabled).toBe(true);
  });

  it("disables Copy when there is no active request", () => {
    const actions = buildPaletteActions(
      makeCtx({ activeRequestPresent: false }),
    );
    expect(actions.find((a) => a.id === "copy-as-curl")?.disabled).toBe(true);
  });

  it("disables Send and Benchmark when canSend is false", () => {
    const actions = buildPaletteActions(makeCtx({ canSend: false }));
    expect(actions.find((a) => a.id === "send-request")?.disabled).toBe(true);
    expect(actions.find((a) => a.id === "run-benchmark")?.disabled).toBe(true);
  });

  it("each action's run calls its injected callable exactly once", () => {
    const ctx = makeCtx();
    const actions = buildPaletteActions(ctx);
    actions.find((a) => a.id === "new-request")!.run();
    actions.find((a) => a.id === "save-request")!.run();
    actions.find((a) => a.id === "open-import")!.run();
    actions.find((a) => a.id === "env-switch-env-prod")!.run();

    expect(ctx.newRequest).toHaveBeenCalledTimes(1);
    expect(ctx.saveRequest).toHaveBeenCalledTimes(1);
    expect(ctx.openImport).toHaveBeenCalledTimes(1);
    expect(ctx.switchEnvironment).toHaveBeenCalledWith("env-prod");
  });

  it("groups actions in canonical order, dropping empty groups", () => {
    const groups = groupPaletteActions(
      buildPaletteActions(makeCtx({ environments: [] })),
    );
    expect(groups.map((g) => g.group)).toEqual([
      "Request",
      "Environments",
      "Tools",
      "View",
    ]);
  });
});
