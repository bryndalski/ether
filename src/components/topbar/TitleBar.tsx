import { CommandHint } from "./CommandHint";
import { EnvPill } from "./EnvPill";
import { ModeTabs } from "./ModeTabs";
import { Wordmark } from "./Wordmark";

/** OS drag titlebar (40px). titleBarStyle is Overlay, so the left inset leaves
 *  room for the macOS traffic-light buttons. Interactive children opt out of
 *  dragging via the .lok-no-drag rules in base.css. */
export function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="lok-drag-region flex shrink-0 items-center justify-between"
      style={{
        height: "var(--lok-titlebar-h)",
        paddingLeft: "var(--lok-space-16)",
        paddingRight: "var(--lok-space-3)",
        backgroundColor: "var(--lok-bg-app)",
        borderBottom: "1px solid var(--lok-border-subtle)",
      }}
    >
      <Wordmark />
      <div className="lok-no-drag flex items-center gap-2">
        <ModeTabs />
      </div>
      <div className="lok-no-drag flex items-center gap-2">
        <EnvPill />
        <CommandHint />
      </div>
    </header>
  );
}
