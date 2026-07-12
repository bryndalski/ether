export type DiffTabKey = "Body" | "Headers" | "Timing";

interface DiffTabsProps {
  active: DiffTabKey;
  counts: Record<DiffTabKey, number>;
  onSelect: (tab: DiffTabKey) => void;
}

const TABS: DiffTabKey[] = ["Body", "Headers", "Timing"];

/** Body | Headers | Timing tablist with per-tab change counts. */
export function DiffTabs({ active, counts, onSelect }: DiffTabsProps) {
  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.indexOf(active);
    if (event.key === "ArrowRight") onSelect(TABS[(index + 1) % TABS.length]);
    else if (event.key === "ArrowLeft")
      onSelect(TABS[(index - 1 + TABS.length) % TABS.length]);
  }

  return (
    <div className="diff-tabs" role="tablist" aria-label="Zakres porównania" onKeyDown={onKeyDown}>
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === active}
          tabIndex={tab === active ? 0 : -1}
          className="diff-tab"
          onClick={() => onSelect(tab)}
        >
          {tab}
          <span className="diff-count lok-tnums">{counts[tab]}</span>
        </button>
      ))}
    </div>
  );
}
