import type { DraftCounts } from "../../hooks/useRequestDraft";

export type RequestTabKey = "Params" | "Headers" | "Body" | "Auth" | "cURL";

const TABS: RequestTabKey[] = ["Params", "Headers", "Body", "Auth", "cURL"];

interface RequestTabsProps {
  active: RequestTabKey;
  onSelect: (tab: RequestTabKey) => void;
  counts: DraftCounts;
}

// Which count feeds each tab's chip (cURL has none).
function countFor(tab: RequestTabKey, counts: DraftCounts): number {
  switch (tab) {
    case "Params":
      return counts.params;
    case "Headers":
      return counts.headers;
    case "Body":
      return counts.body;
    case "Auth":
      return counts.auth;
    case "cURL":
      return 0;
  }
}

/** Request tab strip with per-tab count chips and arrow-key navigation. */
export function RequestTabs({ active, onSelect, counts }: RequestTabsProps) {
  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.indexOf(active);
    if (event.key === "ArrowRight") {
      onSelect(TABS[(index + 1) % TABS.length]);
    } else if (event.key === "ArrowLeft") {
      onSelect(TABS[(index - 1 + TABS.length) % TABS.length]);
    }
  }

  return (
    <div className="req-tabs" role="tablist" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const selected = tab === active;
        const count = countFor(tab, counts);
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? "tab active" : "tab"}
            onClick={() => onSelect(tab)}
          >
            {tab}
            {count > 0 && <span className="count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
