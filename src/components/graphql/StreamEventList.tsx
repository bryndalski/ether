import type { StreamEvent, SubConnState } from "../../hooks/useSubscription";
import { StreamEventRow } from "./StreamEventRow";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface StreamEventListProps {
  events: StreamEvent[]; // newest-first
  connState: SubConnState;
}

/** The scrolling, newest-first event list. It is the ONLY scroll region in the
 *  panel (the shell never scrolls) and an aria-live region so screen readers
 *  hear new events as the server pushes them. */
export function StreamEventList({ events, connState }: StreamEventListProps) {
  const t = useT();
  if (events.length === 0) {
    return (
      <div className="sub-event-list lok-scroll">
        <EmptyState
          headline={
            connState === "connecting"
              ? t("stream.connecting")
              : t("stream.waitingForEvents")
          }
          hint={t("stream.eventsHint")}
          icon={<Icon name="i-flame" size={28} />}
        />
      </div>
    );
  }

  return (
    <ul className="sub-event-list lok-scroll" aria-live="polite" aria-label={t("stream.subscriptionEvents")}>
      {events.map((event) => (
        <StreamEventRow key={event.seq} event={event} />
      ))}
    </ul>
  );
}
