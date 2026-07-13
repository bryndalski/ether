import { useState } from "react";
import { Icon } from "../common/Icon";
import { ConfirmDialog } from "../env/ConfirmDialog";
import { HistoryScopeToggle } from "./HistoryScopeToggle";
import type { HistoryScope } from "../../state/useHistoryStore";
import { useT } from "../../i18n/useT";

interface HistoryDrawerHeaderProps {
  scope: HistoryScope;
  scopeDisabled: boolean;
  onScope: (scope: HistoryScope) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Drawer chrome: title, scope toggle, Clear (confirmed) and close. The clear
 *  copy always says "całą historię" — history_clear wipes the whole table even
 *  when the view is scoped to one request. */
export function HistoryDrawerHeader({
  scope,
  scopeDisabled,
  onScope,
  onClear,
  onClose,
}: HistoryDrawerHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  return (
    <div className="hist-head">
      <span id="hist-title" className="hist-title">
        {t("statusbar.history")}
      </span>
      <HistoryScopeToggle
        scope={scope}
        disabled={scopeDisabled}
        onChange={onScope}
      />
      <button
        type="button"
        className="hist-iconbtn danger"
        aria-label={t("history.clearHistory")}
        title={t("history.clearAllHistory")}
        style={{ marginLeft: "auto" }}
        onClick={() => setConfirming(true)}
      >
        <Icon name="i-trash" size={15} />
      </button>
      <button
        type="button"
        className="hist-iconbtn"
        aria-label={t("history.closeHistory")}
        onClick={onClose}
      >
        <Icon name="i-x" size={15} />
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("history.clearConfirmTitle")}
          message={t("history.clearConfirmMessage")}
          confirmLabel={t("history.clearConfirmButton")}
          onConfirm={() => {
            setConfirming(false);
            onClear();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
