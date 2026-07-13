import type { StreamEvent, SubConnState } from "../../hooks/useSubscription";
import { StreamEventRow } from "./StreamEventRow";
import { EmptyState } from "../common/EmptyState";

interface StreamEventListProps {
  events: StreamEvent[]; // newest-first
  connState: SubConnState;
}

/** The scrolling, newest-first event list. It is the ONLY scroll region in the
 *  panel (the shell never scrolls) and an aria-live region so screen readers
 *  hear new events as the server pushes them. */
export function StreamEventList({ events, connState }: StreamEventListProps) {
  if (events.length === 0) {
    return (
      <div className="sub-event-list lok-scroll">
        <EmptyState
          headline={
            connState === "connecting" ? "Connecting…" : "Waiting for events…"
          }
          hint="Events stream in as the server pushes them."
          icon="~"
        />
      </div>
    );
  }

  return (
    <ul className="sub-event-list lok-scroll" aria-live="polite" aria-label="Strumień zdarzeń subskrypcji">
      {events.map((event) => (
        <StreamEventRow key={event.seq} event={event} />
      ))}
    </ul>
  );
}
