import { useHistoryStore } from "../../state/useHistoryStore";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { HistoryRow } from "./HistoryRow";

interface HistoryListProps {
  now: number;
  onReplay: (id: string) => void;
}

/** The only scrolling region in the drawer. Renders loading / empty / error /
 *  rows from the store. */
export function HistoryList({ now, onReplay }: HistoryListProps) {
  const entries = useHistoryStore((state) => state.entries);
  const loading = useHistoryStore((state) => state.loading);
  const error = useHistoryStore((state) => state.error);
  const openedId = useHistoryStore((state) => state.openedId);
  const selectedIds = useHistoryStore((state) => state.selectedIds);
  const openEntry = useHistoryStore((state) => state.openEntry);
  const toggleSelect = useHistoryStore((state) => state.toggleSelect);

  if (error) {
    return (
      <div className="hist-list">
        <div className="hist-banner" role="alert" aria-live="polite">
          Nie udało się wczytać historii: {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hist-list lok-scroll" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hist-row" style={{ opacity: 0.4 }}>
            <span className="lok-shimmer" style={{ height: 16 }} />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="hist-list">
        <EmptyState
          headline="Brak historii"
          hint="Wyślij request, żeby zobaczyć go tutaj."
          icon={<Icon name="i-history" size={28} />}
        />
      </div>
    );
  }

  return (
    <div className="hist-list lok-scroll">
      {entries.map((entry) => {
        const selectionIndex = selectedIds.indexOf(entry.id);
        return (
          <HistoryRow
            key={entry.id}
            entry={entry}
            active={entry.id === openedId}
            selectionIndex={selectionIndex === -1 ? null : selectionIndex}
            now={now}
            onOpen={() => openEntry(entry.id)}
            onToggleSelect={() => toggleSelect(entry.id)}
            onReplay={() => onReplay(entry.id)}
          />
        );
      })}
    </div>
  );
}
