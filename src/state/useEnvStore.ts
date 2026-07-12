import { create } from "zustand";
import {
  getActiveEnvironmentId,
  listEnvironments,
  setActiveEnvironment as setActiveEnvironmentIpc,
} from "../lib/ipc";
import type { EnvKind, Environment } from "../lib/types";

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

  activeEnvironment: () => Environment | null;
  activeKind: () => EnvKind;
}

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

  activeEnvironment: () => {
    const { environments, activeEnvironmentId } = get();
    return (
      environments.find((environment) => environment.id === activeEnvironmentId) ??
      null
    );
  },

  activeKind: () => envKind(get().activeEnvironment()),
}));
