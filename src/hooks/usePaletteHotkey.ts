import { useEffect } from "react";
import { useUiStore } from "../state/useUiStore";

/** Global ⌘K / Ctrl+K opens the command palette from anywhere. */
export function usePaletteHotkey(): void {
  const togglePalette = useUiStore((state) => state.togglePalette);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePalette]);
}
