import { useHistoryStore } from "../../state/useHistoryStore";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { HistoryRow } from "./HistoryRow";
import { useT } from "../../i18n/useT";

interface HistoryListProps {
  now: number;
  onReplay: (id: string) => void;
}

/** The only scrolling region in the drawer. Renders loading / empty / error /
 *  rows from the store. */
export function HistoryList({ now, onReplay }: HistoryListProps) {
  const allEntries = useHistoryStore((state) => state.entries);
  const filters = useHistoryStore((state) => state.filters);
  const loading = useHistoryStore((state) => state.loading);
  const error = useHistoryStore((state) => state.error);
  const openedId = useHistoryStore((state) => state.openedId);
  const selectedIds = useHistoryStore((state) => state.selectedIds);
  const openEntry = useHistoryStore((state) => state.openEntry);
  const toggleSelect = useHistoryStore((state) => state.toggleSelect);
  const clearFilters = useHistoryStore((state) => state.clearFilters);
  const visibleEntries = useHistoryStore((state) => state.visibleEntries);
  const filtersActive = useHistoryStore((state) => state.filtersActive);
  const t = useT();
  // Subscribe to entries + filters so this recomputes on either change.
  void allEntries;
  void filters;
  const entries = visibleEntries();

  if (error) {
    return (
      <div className="hist-list">
        <div className="hist-banner" role="alert" aria-live="polite">
          {t("history.loadError", { error })}
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
    // Distinguish "nothing recorded" from "filters hid everything" so the user
    // gets a clear-filters escape hatch instead of a dead end.
    const filtered = filtersActive() && allEntries.length > 0;
    return (
      <div className="hist-list">
        <EmptyState
          compact={filtered}
          headline={
            filtered ? t("history.noMatchHeadline") : t("history.emptyHeadline")
          }
          hint={filtered ? t("history.noMatchHint") : t("history.emptyHint")}
          actionLabel={filtered ? t("history.clearFilters") : undefined}
          onAction={filtered ? clearFilters : undefined}
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
