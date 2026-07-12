import { Icon } from "../common/Icon";

export type ResponseTabKey = "Body" | "Headers" | "Timeline" | "curl -v";

const TABS: ResponseTabKey[] = ["Body", "Headers", "Timeline", "curl -v"];

interface ResponseTabsProps {
  active: ResponseTabKey;
  onSelect: (tab: ResponseTabKey) => void;
  headerCount: number;
  onCopy: () => void;
}

/** Response tab strip: Body / Headers / Timeline / curl -v + a copy button. */
export function ResponseTabs({
  active,
  onSelect,
  headerCount,
  onCopy,
}: ResponseTabsProps) {
  return (
    <div className="resp-tabs" role="tablist">
      {TABS.map((tab) => {
        const selected = tab === active;
        const showCount = tab === "Headers" && headerCount > 0;
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
            {showCount && <span className="count">{headerCount}</span>}
          </button>
        );
      })}
      <button
        type="button"
        className="tab"
        aria-label="Kopiuj odpowiedź"
        style={{ marginLeft: "auto" }}
        onClick={onCopy}
      >
        <Icon name="i-copy" size={13} />
      </button>
    </div>
  );
}
