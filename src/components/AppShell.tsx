import { useShellBootstrap } from "../hooks/useShellBootstrap";
import { usePaletteHotkey } from "../hooks/usePaletteHotkey";
import { useUiStore } from "../state/useUiStore";
import { TitleBar } from "./topbar/TitleBar";
import { Sidebar } from "./sidebar/Sidebar";
import { RequestEditor } from "./editor/RequestEditor";
import { ResponseDock } from "./response/ResponseDock";
import { StatusBar } from "./statusbar/StatusBar";
import { CommandPalette } from "./palette/CommandPalette";

/** The three-zone app shell (titlebar · sidebar · editor+response · statusbar).
 *  Fixed 100dvh, no window scroll — panels scroll internally. Response dock is
 *  bottom by default, switchable to the right. */
export function AppShell() {
  useShellBootstrap();
  usePaletteHotkey();
  const placement = useUiStore((state) => state.responsePlacement);

  return (
    <>
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${
            placement === "bottom" ? "flex-col" : "flex-row"
          }`}
        >
          <RequestEditor />
          <ResponseDock />
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
    </>
  );
}
