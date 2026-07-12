interface TabBarProps {
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
  trailing?: string;
}

/** Horizontal tab strip (34px) with a heat underline on the active tab. */
export function TabBar({ tabs, active, onSelect, trailing }: TabBarProps) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center gap-1 px-2"
      style={{
        height: "var(--lok-tabbar-h)",
        borderBottom: "1px solid var(--lok-border-subtle)",
      }}
    >
      {tabs.map((tab) => {
        const selected = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab)}
            className="relative px-2 py-1 transition-colors"
            style={{
              fontSize: "var(--lok-fs-sm)",
              color: selected
                ? "var(--lok-text-primary)"
                : "var(--lok-text-tertiary)",
            }}
          >
            {tab}
            {selected && (
              <span
                aria-hidden
                className="lok-heat-gradient absolute inset-x-1 -bottom-px"
                style={{ height: 2, borderRadius: "var(--lok-radius-full)" }}
              />
            )}
          </button>
        );
      })}
      {trailing && (
        <span
          className="lok-mono ml-auto pr-1"
          style={{
            color: "var(--lok-text-tertiary)",
            fontSize: "var(--lok-fs-xs)",
          }}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}
