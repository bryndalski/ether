import { useShellBootstrap } from "../hooks/useShellBootstrap";
import { usePaletteHotkey } from "../hooks/usePaletteHotkey";
import { TitleBar } from "./topbar/TitleBar";
import { Sidebar } from "./sidebar/Sidebar";
import { RequestWorkbench } from "./workbench/RequestWorkbench";
import { StatusBar } from "./statusbar/StatusBar";
import { CommandPalette } from "./palette/CommandPalette";
import { IconSprite } from "./common/IconSprite";

/** The three-zone app shell (titlebar · sidebar · editor+response · statusbar).
 *  Fixed 100dvh, no window scroll — panels scroll internally. Response dock is
 *  bottom by default, switchable to the right. */
export function AppShell() {
  useShellBootstrap();
  usePaletteHotkey();

  return (
    <>
      <IconSprite />
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <RequestWorkbench />
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
    </>
  );
}
