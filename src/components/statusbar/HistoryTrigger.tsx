import { useHistoryStore } from "../../state/useHistoryStore";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

/** Statusbar affordance that opens the History drawer ("what did I just run?"). */
export function HistoryTrigger() {
  const open = useHistoryStore((state) => state.open);
  const count = useHistoryStore((state) => state.entries.length);
  const t = useT();

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 lok-tnums"
      aria-label={t("statusbar.openHistory")}
      title={t("statusbar.requestHistory")}
      onClick={open}
      style={{ color: "var(--lok-text-tertiary)" }}
    >
      <Icon name="i-history" size={13} />
      {t("statusbar.history")}
      {count > 0 && <span className="lok-mono">({count})</span>}
    </button>
  );
}
