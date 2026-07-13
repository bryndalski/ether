import type { HistoryScope } from "../../state/useHistoryStore";
import { useT } from "../../i18n/useT";

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
  const t = useT();
  return (
    <div className="hist-scope" role="group" aria-label={t("history.scopeAria")}>
      <button
        type="button"
        aria-pressed={scope === "all"}
        onClick={() => onChange("all")}
      >
        {t("history.scopeAll")}
      </button>
      <button
        type="button"
        aria-pressed={scope === "request"}
        disabled={disabled}
        onClick={() => onChange("request")}
      >
        {t("history.scopeThisRequest")}
      </button>
    </div>
  );
}
