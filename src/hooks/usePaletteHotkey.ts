import { useEffect } from "react";
import { useUiStore } from "../state/useUiStore";
import { useHistoryStore } from "../state/useHistoryStore";
import { useWorkbenchActions } from "../state/useWorkbenchActions";
import { useNewRequest } from "./useNewRequest";

/** Global hotkeys the palette advertises, so its shortcut hints are truthful:
 *  ⌘K toggle palette · ⌘N new request · ⌘I import · ⌘Y history · ⌘⇧C copy cURL ·
 *  ⌘B collapse/expand sidebar. ⌘S / ⌘Enter stay on the editor (they act on the
 *  live draft there). */
export function usePaletteHotkey(): void {
  const togglePalette = useUiStore((state) => state.togglePalette);
  const openImport = useUiStore((state) => state.openImport);
  const toggleSidebar = useUiStore((state) => state.toggleSidebarCollapsed);
  const openHistory = useHistoryStore((state) => state.open);
  const newRequest = useNewRequest();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        togglePalette();
      } else if (key === "n") {
        event.preventDefault();
        newRequest();
      } else if (key === "i") {
        event.preventDefault();
        openImport();
      } else if (key === "y") {
        event.preventDefault();
        openHistory();
      } else if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleSidebar();
      } else if (key === "c" && event.shiftKey) {
        const copyCurl = useWorkbenchActions.getState().copyCurl;
        if (copyCurl) {
          event.preventDefault();
          copyCurl();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePalette, openImport, openHistory, toggleSidebar, newRequest]);
}
