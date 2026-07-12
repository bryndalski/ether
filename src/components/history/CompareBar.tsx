interface CompareBarProps {
  selectedCount: number;
  onCompare: () => void;
  onClear: () => void;
}

/** Shows the diff-selection state and the Compare CTA (enabled at exactly 2). */
export function CompareBar({ selectedCount, onCompare, onClear }: CompareBarProps) {
  return (
    <div className="hist-compare">
      <span>
        {selectedCount === 0
          ? "Zaznacz dwa wpisy, żeby porównać"
          : `${selectedCount} zaznaczone`}
      </span>
      {selectedCount > 0 && (
        <button type="button" className="hist-compare-btn" onClick={onClear}>
          Wyczyść zaznaczenie
        </button>
      )}
      <button
        type="button"
        className="hist-compare-btn"
        style={{ marginLeft: "auto" }}
        disabled={selectedCount !== 2}
        onClick={onCompare}
      >
        Porównaj
      </button>
    </div>
  );
}
