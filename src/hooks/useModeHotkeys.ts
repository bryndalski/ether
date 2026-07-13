import { useEffect } from "react";
import { useUiStore } from "../state/useUiStore";

/** ⌘1 → Requests, ⌘2 → Workflows. Toggles the top-level app mode, matching the
 *  ModeTabs segmented control in the titlebar. */
export function useModeHotkeys(): void {
  const setMode = useUiStore((state) => state.setMode);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "1") {
        event.preventDefault();
        setMode("requests");
      } else if (event.key === "2") {
        event.preventDefault();
        setMode("workflows");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setMode]);
}
