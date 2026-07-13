import type { StreamEvent } from "../../hooks/useSubscription";
import { relativeTimeLabel } from "../../lib/relativeTime";
import { prettyJson } from "../../lib/prettyJson";

interface StreamEventRowProps {
  event: StreamEvent;
}

/** One streamed event: a relative timestamp (absolute on hover), a kind badge
 *  (never color-only — the word carries it), and the pretty-printed payload. */
export function StreamEventRow({ event }: StreamEventRowProps) {
  const isError = event.kind === "error";
  return (
    <li className="sub-event-row">
      <div className="sub-event-head">
        <span
          className={`sub-kind ${isError ? "is-error" : "is-next"}`}
          style={{
            color: isError
              ? "var(--lok-status-danger)"
              : "var(--lok-status-success)",
          }}
        >
          {event.kind}
        </span>
        <span className="sub-ts lok-tnums" title={event.ts}>
          {relativeTimeLabel(event.ts)}
        </span>
      </div>
      <pre className="sub-event-body lok-mono">{prettyJson(event.payload)}</pre>
    </li>
  );
}
