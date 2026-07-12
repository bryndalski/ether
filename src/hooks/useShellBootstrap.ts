import { useEffect } from "react";
import { useCollectionsStore } from "../state/useCollectionsStore";
import { useEnvStore } from "../state/useEnvStore";
import { useUiStore } from "../state/useUiStore";

/** Loads persisted data on mount and keeps <html> in sync with theme + active
 *  env, so tokens.css (data-theme) and base.css (data-env) drive all styling
 *  without inline styles anywhere in the component tree. */
export function useShellBootstrap(): void {
  const loadCollections = useCollectionsStore((state) => state.load);
  const loadEnvironments = useEnvStore((state) => state.load);
  const theme = useUiStore((state) => state.theme);
  const activeKind = useEnvStore((state) => state.activeKind());

  useEffect(() => {
    void loadCollections();
    void loadEnvironments();
  }, [loadCollections, loadEnvironments]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-env", activeKind);
  }, [activeKind]);
}
