import type { UseSubscription } from "../../hooks/useSubscription";
import { StreamStatusBar } from "./StreamStatusBar";
import { StreamEventList } from "./StreamEventList";

interface SubscriptionStreamProps {
  stream: UseSubscription;
}

/** Zone-3 replacement for the one-shot ResponseDock while an operation is a
 *  subscription: a status bar over a scrolling, newest-first event list. All
 *  logic lives in useSubscription; this view just lays out. */
export function SubscriptionStream({ stream }: SubscriptionStreamProps) {
  return (
    <div className="sub-stream">
      <StreamStatusBar
        connState={stream.connState}
        eventCount={stream.eventCount}
        onClear={stream.clear}
      />
      <StreamEventList events={stream.events} connState={stream.connState} />
    </div>
  );
}
