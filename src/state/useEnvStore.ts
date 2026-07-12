import { create } from "zustand";
import {
  deleteEnvironment as deleteEnvironmentIpc,
  getActiveEnvironmentId,
  listEnvironments,
  setActiveEnvironment as setActiveEnvironmentIpc,
  upsertEnvironment as upsertEnvironmentIpc,
} from "../lib/ipc";
import type { EnvKind, Environment } from "../lib/types";
import { mergedVars, type MergedVar } from "../lib/envMerge";
import { makeId } from "../lib/ids";

/** Map an environment onto one of the five design-system accent kinds. The
 *  stored `color` field carries the kind when set; otherwise we infer from the
 *  name so the pill is always colored meaningfully (prod = red = careful). */
export function envKind(environment: Environment | null): EnvKind {
  if (!environment) return "local";
  const known: EnvKind[] = ["local", "dev", "staging", "prod", "custom"];
  const fromColor = environment.color?.toLowerCase();
  if (fromColor && known.includes(fromColor as EnvKind)) {
    return fromColor as EnvKind;
  }
  const name = environment.name.toLowerCase();
  if (name.includes("prod")) return "prod";
  if (name.includes("stag")) return "staging";
  if (name.includes("dev")) return "dev";
  if (name.includes("local")) return "local";
  return "custom";
}

interface EnvState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  loading: boolean;
  loadFailed: boolean;

  load: () => Promise<void>;
  switchEnvironment: (id: string | null) => Promise<void>;

  // CRUD (optimistic + IPC + rollback)
  createEnvironment: (parentId: string | null) => Promise<string>;
  patchEnvironment: (
    id: string,
    partial: Partial<Environment>,
  ) => Promise<void>;
  removeEnvironment: (id: string) => Promise<void>;

  activeEnvironment: () => Environment | null;
  activeKind: () => EnvKind;
  mergedActiveVars: () => MergedVar[];
  mergedVarsFor: (id: string) => MergedVar[];
}

type EnvSnapshot = Pick<EnvState, "environments" | "activeEnvironmentId">;

export const useEnvStore = create<EnvState>((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  loading: false,
  loadFailed: false,

  load: async () => {
    set({ loading: true, loadFailed: false });
    try {
      const [environments, activeEnvironmentId] = await Promise.all([
        listEnvironments(),
        getActiveEnvironmentId().catch(() => null),
      ]);
      set({
        environments,
        activeEnvironmentId: activeEnvironmentId ?? environments[0]?.id ?? null,
        loading: false,
      });
    } catch {
      set({ environments: [], loading: false, loadFailed: true });
    }
  },

  switchEnvironment: async (id) => {
    set({ activeEnvironmentId: id });
    try {
      await setActiveEnvironmentIpc(id);
    } catch {
      // Persisting the choice is best-effort while the store backend is stubbed.
    }
  },

  createEnvironment: async (parentId) => {
    const before: EnvSnapshot = {
      environments: get().environments,
      activeEnvironmentId: get().activeEnvironmentId,
    };
    const environment: Environment = {
      id: makeId("env"),
      name: "Nowe środowisko",
      parent_id: parentId,
      color: null,
      variables: [],
      secret_names: [],
    };
    set({ environments: [...get().environments, environment] });
    try {
      await upsertEnvironmentIpc(environment);
    } catch {
      set(before);
    }
    return environment.id;
  },

  patchEnvironment: async (id, partial) => {
    const before: EnvSnapshot = {
      environments: get().environments,
      activeEnvironmentId: get().activeEnvironmentId,
    };
    const target = get().environments.find(
      (environment) => environment.id === id,
    );
    if (!target) return;
    const next = { ...target, ...partial };
    set({
      environments: get().environments.map((environment) =>
        environment.id === id ? next : environment,
      ),
    });
    try {
      await upsertEnvironmentIpc(next);
    } catch {
      set(before);
    }
  },

  removeEnvironment: async (id) => {
    const before: EnvSnapshot = {
      environments: get().environments,
      activeEnvironmentId: get().activeEnvironmentId,
    };
    // Cascade sub-envs so the list never shows an orphaned child.
    const subtree = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const environment of get().environments) {
        if (
          environment.parent_id &&
          subtree.has(environment.parent_id) &&
          !subtree.has(environment.id)
        ) {
          subtree.add(environment.id);
          grew = true;
        }
      }
    }
    const environments = get().environments.filter(
      (environment) => !subtree.has(environment.id),
    );
    const activeCleared = subtree.has(get().activeEnvironmentId ?? "");
    set({
      environments,
      activeEnvironmentId: activeCleared ? null : get().activeEnvironmentId,
    });
    if (activeCleared) {
      try {
        await setActiveEnvironmentIpc(null);
      } catch {
        // best-effort
      }
    }
    try {
      await deleteEnvironmentIpc(id);
    } catch {
      set(before);
    }
  },

  activeEnvironment: () => {
    const { environments, activeEnvironmentId } = get();
    return (
      environments.find((environment) => environment.id === activeEnvironmentId) ??
      null
    );
  },

  activeKind: () => envKind(get().activeEnvironment()),

  mergedActiveVars: () => {
    const { activeEnvironmentId, environments } = get();
    if (!activeEnvironmentId) return [];
    return mergedVars(environments, activeEnvironmentId);
  },

  mergedVarsFor: (id) => mergedVars(get().environments, id),
}));
