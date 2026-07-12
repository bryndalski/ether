import { useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { EmptyState } from "../common/EmptyState";
import { TabBar } from "../common/TabBar";

const RESPONSE_TABS = ["Body", "Headers", "Timeline"];

/** Response dock (Zone 3). Bottom by default, resizable/switchable to the right
 *  later. Shows the "no response yet" empty state until a Send lands. */
export function ResponseDock() {
  const placement = useUiStore((state) => state.responsePlacement);
  const responseSize = useUiStore((state) => state.responseSize);
  const [tab, setTab] = useState(RESPONSE_TABS[0]);

  const sizeStyle =
    placement === "bottom"
      ? { height: `${responseSize}%` }
      : { width: "var(--lok-response-w)" };
  const borderStyle =
    placement === "bottom"
      ? { borderTop: "1px solid var(--lok-border-default)" }
      : { borderLeft: "1px solid var(--lok-border-default)" };

  return (
    <section
      aria-label="Odpowiedź"
      className="flex shrink-0 flex-col overflow-hidden"
      style={{
        ...sizeStyle,
        ...borderStyle,
        backgroundColor: "var(--lok-bg-code)",
      }}
    >
      <TabBar tabs={RESPONSE_TABS} active={tab} onSelect={setTab} />
      <div className="lok-scroll lok-selectable flex-1">
        <EmptyState
          headline="Naciśnij Send i zobacz waterfall"
          hint="Odpowiedź, nagłówki i oś czasu pojawią się tutaj."
          shortcut="⌘↵"
          icon="⚡"
        />
      </div>
    </section>
  );
}
