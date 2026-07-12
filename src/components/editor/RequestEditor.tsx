import { useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { EmptyState } from "../common/EmptyState";
import { TabBar } from "../common/TabBar";
import { RequestToolbar } from "./RequestToolbar";

const EDITOR_TABS = ["Params", "Headers", "Body", "Auth", "Tests"];

/** Request editor (Zone 2). Toolbar + tabs + a placeholder editor surface. The
 *  two-way GUI↔curl editor is a later milestone; this wires the shell. */
export function RequestEditor() {
  const activeRequest = useCollectionsStore((state) => state.activeRequest());
  const newRequest = useNewRequest();
  const [tab, setTab] = useState(EDITOR_TABS[0]);

  if (!activeRequest) {
    return (
      <section
        className="flex flex-1 flex-col"
        style={{ backgroundColor: "var(--lok-bg-surface)" }}
      >
        <EmptyState
          headline="Wklej curl albo zacznij od GET"
          hint="Wybierz request z kolekcji lub utwórz nowy, by zacząć."
          actionLabel="Nowy request"
          shortcut="⌘N"
          onAction={newRequest}
          icon="~"
        />
      </section>
    );
  }

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden"
      style={{ backgroundColor: "var(--lok-bg-surface)" }}
    >
      <RequestToolbar request={activeRequest} />
      <TabBar tabs={EDITOR_TABS} active={tab} onSelect={setTab} trailing="⌗ curl" />
      <div className="lok-scroll flex-1 p-4">
        <p
          className="lok-mono"
          style={{
            color: "var(--lok-text-tertiary)",
            fontSize: "var(--lok-fs-sm)",
          }}
        >
          {tab} — edytor pojawi się w kolejnym kroku.
        </p>
      </div>
    </section>
  );
}
