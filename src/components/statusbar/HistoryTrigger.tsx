import { useHistoryStore } from "../../state/useHistoryStore";
import { Icon } from "../common/Icon";

/** Statusbar affordance that opens the History drawer ("what did I just run?"). */
export function HistoryTrigger() {
  const open = useHistoryStore((state) => state.open);
  const count = useHistoryStore((state) => state.entries.length);

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 lok-tnums"
      aria-label="Otwórz historię"
      title="Historia requestów"
      onClick={open}
      style={{ color: "var(--lok-text-tertiary)" }}
    >
      <Icon name="i-history" size={13} />
      Historia
      {count > 0 && <span className="lok-mono">({count})</span>}
    </button>
  );
}
