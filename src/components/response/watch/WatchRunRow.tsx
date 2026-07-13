import type { WatchRun } from "../../../hooks/useWatchMode";
import { relativeTimeLabel } from "../../../lib/relativeTime";

interface WatchRunRowProps {
  run: WatchRun;
}

/** One watch run: overall verdict + status + ms + assertions p/t + snapshot. */
export function WatchRunRow({ run }: WatchRunRowProps) {
  const verdict = run.ok ? "✓" : "✗";
  const verdictWord = run.ok ? "OK" : "Fail";
  return (
    <div
      className={`watch-run ${run.ok ? "pass" : "fail"}`}
      aria-label={`Przebieg ${verdictWord}, status ${run.status ?? "błąd"}`}
    >
      <span className="watch-sigil" aria-hidden="true">
        {verdict}
      </span>
      <span className="watch-time lok-tnums" title={new Date(run.at).toISOString()}>
        {relativeTimeLabel(new Date(run.at).toISOString())}
      </span>
      <span className="watch-status lok-tnums">{run.status ?? "—"}</span>
      <span className="watch-ms lok-tnums">
        {run.totalMs !== null ? `${run.totalMs.toFixed(0)} ms` : "—"}
      </span>
      {run.assertions && (
        <span className="watch-assert lok-tnums">
          {run.assertions.passed}/{run.assertions.total}
        </span>
      )}
      {run.snapshot && (
        <span className="watch-snap" aria-label={`snapshot ${run.snapshot}`}>
          {run.snapshot === "pass" ? "snap ✓" : "snap ✗"}
        </span>
      )}
      {run.error && <span className="watch-err">{run.error}</span>}
    </div>
  );
}
