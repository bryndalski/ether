// Ephemeral view state for the EnvironmentManager modal: which env is being
// edited (distinct from the live/switched active env), plus a debounced patch
// so typing does not spam upsert_environment. All data goes through useEnvStore.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEnvStore } from "../state/useEnvStore";
import type { Environment } from "../lib/types";

const PATCH_DEBOUNCE_MS = 300;

export interface EnvManagerApi {
  environments: Environment[];
  selectedEnvId: string | null;
  selectedEnv: Environment | null;
  selectEnv: (id: string) => void;
  patch: (partial: Partial<Environment>) => void;
  createEnvironment: (parentId: string | null) => Promise<void>;
  removeEnvironment: (id: string) => Promise<void>;
}

export function useEnvManager(): EnvManagerApi {
  const environments = useEnvStore((state) => state.environments);
  const patchEnvironment = useEnvStore((state) => state.patchEnvironment);
  const createEnv = useEnvStore((state) => state.createEnvironment);
  const removeEnv = useEnvStore((state) => state.removeEnvironment);

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    () => environments[0]?.id ?? null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a valid selection as the list changes.
  useEffect(() => {
    if (selectedEnvId && environments.some((e) => e.id === selectedEnvId)) {
      return;
    }
    setSelectedEnvId(environments[0]?.id ?? null);
  }, [environments, selectedEnvId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const patch = useCallback(
    (partial: Partial<Environment>) => {
      if (!selectedEnvId) return;
      const id = selectedEnvId;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void patchEnvironment(id, partial);
      }, PATCH_DEBOUNCE_MS);
    },
    [selectedEnvId, patchEnvironment],
  );

  const selectedEnv =
    environments.find((e) => e.id === selectedEnvId) ?? null;

  return {
    environments,
    selectedEnvId,
    selectedEnv,
    selectEnv: setSelectedEnvId,
    patch,
    createEnvironment: async (parentId) => {
      const id = await createEnv(parentId);
      setSelectedEnvId(id);
    },
    removeEnvironment: async (id) => {
      await removeEnv(id);
    },
  };
}
