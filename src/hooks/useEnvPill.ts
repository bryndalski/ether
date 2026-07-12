import { useCallback, useState } from "react";
import { useEnvStore } from "../state/useEnvStore";

/** Open/close state and actions for the env-switcher pill. */
export function useEnvPill() {
  const environments = useEnvStore((state) => state.environments);
  const activeEnvironment = useEnvStore((state) => state.activeEnvironment());
  const activeEnvironmentId = useEnvStore((state) => state.activeEnvironmentId);
  const switchEnvironment = useEnvStore((state) => state.switchEnvironment);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quickLookOpen, setQuickLookOpen] = useState(false);

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((open) => !open);
    setQuickLookOpen(false);
  }, []);

  const select = useCallback(
    (id: string) => {
      void switchEnvironment(id);
      setDropdownOpen(false);
    },
    [switchEnvironment],
  );

  return {
    environments,
    activeEnvironment,
    activeEnvironmentId,
    dropdownOpen,
    quickLookOpen,
    toggleDropdown,
    openQuickLook: () => setQuickLookOpen(true),
    closeQuickLook: () => setQuickLookOpen(false),
    select,
  };
}
