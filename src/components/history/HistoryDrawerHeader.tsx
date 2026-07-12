import { useState } from "react";
import { Icon } from "../common/Icon";
import { ConfirmDialog } from "../env/ConfirmDialog";
import { HistoryScopeToggle } from "./HistoryScopeToggle";
import type { HistoryScope } from "../../state/useHistoryStore";

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

  return (
    <div className="hist-head">
      <span id="hist-title" className="hist-title">
        Historia
      </span>
      <HistoryScopeToggle
        scope={scope}
        disabled={scopeDisabled}
        onChange={onScope}
      />
      <button
        type="button"
        className="hist-iconbtn danger"
        aria-label="Wyczyść historię"
        title="Wyczyść całą historię"
        style={{ marginLeft: "auto" }}
        onClick={() => setConfirming(true)}
      >
        <Icon name="i-trash" size={15} />
      </button>
      <button
        type="button"
        className="hist-iconbtn"
        aria-label="Zamknij historię"
        onClick={onClose}
      >
        <Icon name="i-x" size={15} />
      </button>
      {confirming && (
        <ConfirmDialog
          title="Wyczyścić historię?"
          message="Usunąć całą historię? Tej operacji nie można cofnąć."
          confirmLabel="Usuń wszystko"
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
