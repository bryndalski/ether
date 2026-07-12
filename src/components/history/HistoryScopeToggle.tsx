import type { HistoryScope } from "../../state/useHistoryStore";

interface HistoryScopeToggleProps {
  scope: HistoryScope;
  disabled: boolean;
  onChange: (scope: HistoryScope) => void;
}

/** All ⇄ This request segmented control. Disabled (forced All) when there is no
 *  active request to filter by. */
export function HistoryScopeToggle({
  scope,
  disabled,
  onChange,
}: HistoryScopeToggleProps) {
  return (
    <div className="hist-scope" role="group" aria-label="Zakres historii">
      <button
        type="button"
        aria-pressed={scope === "all"}
        onClick={() => onChange("all")}
      >
        Wszystkie
      </button>
      <button
        type="button"
        aria-pressed={scope === "request"}
        disabled={disabled}
        onClick={() => onChange("request")}
      >
        Ten request
      </button>
    </div>
  );
}
