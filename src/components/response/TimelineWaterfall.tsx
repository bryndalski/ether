import type { Timings } from "../../lib/types";
import { phaseSpans } from "../../lib/waterfall";
import { formatMs } from "../../lib/format";

interface TimelineWaterfallProps {
  timings: Timings;
}

/** Proportional phase waterfall. Bar left/width are percentages of total_ms;
 *  the label + ms are real text (not just bar width) for a11y. */
export function TimelineWaterfall({ timings }: TimelineWaterfallProps) {
  const spans = phaseSpans(timings);
  return (
    <div>
      <div className="wb-label" style={{ marginBottom: "var(--lok-space-3)" }}>
        Timeline · waterfall
      </div>
      <div className="wf">
        {spans.map((span) => (
          <div className="wf-row" key={span.phase}>
            <span className="lbl">{span.label}</span>
            <div className="wf-track">
              <span
                className="wf-bar"
                style={{
                  left: `${span.leftPct}%`,
                  width: `${span.widthPct}%`,
                  background: span.colorToken,
                }}
              />
            </div>
            <span className="ms">{formatMs(span.durationMs)}</span>
          </div>
        ))}
      </div>
      <div className="wf-legend">
        {spans.map((span) => (
          <span className="lg" key={span.phase}>
            <span className="sw2" style={{ background: span.colorToken }} />
            {span.label}
          </span>
        ))}
      </div>
    </div>
  );
}
