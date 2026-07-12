import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useUiStore } from "../../state/useUiStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { EmptyState } from "../common/EmptyState";
import { CollectionTree } from "./CollectionTree";

/** Collections rail (Zone 1). Search header + tree; shows a heat empty-state
 *  with a "New request" action when there is nothing to show (including the
 *  "not implemented" backend case). */
export function Sidebar() {
  const collections = useCollectionsStore((state) => state.collections);
  const requests = useCollectionsStore((state) => state.requests);
  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  const loading = useCollectionsStore((state) => state.loading);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const newRequest = useNewRequest();

  const isEmpty = !loading && requests.length === 0;

  return (
    <aside
      className="flex shrink-0 flex-col"
      style={{
        width: sidebarWidth,
        minWidth: "var(--lok-sidebar-w-min)",
        maxWidth: "var(--lok-sidebar-w-max)",
        backgroundColor: "var(--lok-bg-sidebar)",
        borderRight: "1px solid var(--lok-border-subtle)",
      }}
    >
      <div
        className="shrink-0 p-2"
        style={{ borderBottom: "1px solid var(--lok-border-subtle)" }}
      >
        <input
          type="search"
          placeholder="Szukaj requestów…"
          aria-label="Szukaj requestów"
          className="w-full rounded-[var(--lok-radius-sm)] px-2 py-1.5"
          style={{
            backgroundColor: "var(--lok-bg-input)",
            color: "var(--lok-text-primary)",
            fontSize: "var(--lok-fs-sm)",
            border: "1px solid var(--lok-border-default)",
          }}
        />
      </div>

      <div className="lok-scroll flex-1">
        {isEmpty ? (
          <EmptyState
            headline="Rozgrzej pierwszą lokówkę"
            hint="Nie masz jeszcze żadnych requestów. Zacznij od nowego."
            actionLabel="Nowy request"
            shortcut="⌘N"
            onAction={newRequest}
            icon="🌀"
          />
        ) : (
          <CollectionTree
            collections={collections}
            requests={requests}
            activeRequestId={activeRequestId}
          />
        )}
      </div>
    </aside>
  );
}
