import { useT } from "../../i18n/useT";

interface CompareBarProps {
  selectedCount: number;
  onCompare: () => void;
  onClear: () => void;
}

/** Shows the diff-selection state and the Compare CTA (enabled at exactly 2). */
export function CompareBar({ selectedCount, onCompare, onClear }: CompareBarProps) {
  const t = useT();
  return (
    <div className="hist-compare">
      <span>
        {selectedCount === 0
          ? t("history.selectTwoToCompare")
          : t("history.selectedCount", { count: selectedCount })}
      </span>
      {selectedCount > 0 && (
        <button type="button" className="hist-compare-btn" onClick={onClear}>
          {t("history.clearSelection")}
        </button>
      )}
      <button
        type="button"
        className="hist-compare-btn"
        style={{ marginLeft: "auto" }}
        disabled={selectedCount !== 2}
        onClick={onCompare}
      >
        {t("history.compare")}
      </button>
    </div>
  );
}
