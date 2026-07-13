import type { SubConnState } from "../../hooks/useSubscription";
import { ConnStatusBadge } from "./ConnStatusBadge";
import { Icon } from "../common/Icon";

interface StreamStatusBarProps {
  connState: SubConnState;
  eventCount: number;
  onClear: () => void;
}

/** The stream panel header: connection badge + tabular event counter + Clear.
 *  Clear empties the visible buffer (and thus the counter) without touching the
 *  live socket. */
export function StreamStatusBar({
  connState,
  eventCount,
  onClear,
}: StreamStatusBarProps) {
  return (
    <div className="sub-statusbar">
      <ConnStatusBadge connState={connState} />
      <span className="sub-count lok-tnums" aria-live="polite">
        {eventCount} {eventCount === 1 ? "event" : "events"}
      </span>
      <span className="spacer" />
      <button
        type="button"
        className="btn-save"
        aria-label="Wyczyść strumień zdarzeń"
        title="Wyczyść strumień"
        disabled={eventCount === 0}
        onClick={onClear}
      >
        <Icon name="i-trash" size={14} />
      </button>
    </div>
  );
}
