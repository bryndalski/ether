import { formatMs, humanBytes } from "../../lib/format";
import { relativeTimeLabel } from "../../lib/relativeTime";
import type { HistoryEntry } from "../../lib/types";

interface HistoryRowMetaProps {
  entry: HistoryEntry;
  now: number;
}

/** Relative time · total ms · download size — all tabular-nums. */
export function HistoryRowMeta({ entry, now }: HistoryRowMetaProps) {
  return (
    <span className="hist-row-meta lok-tnums">
      <span title={entry.executed_at}>
        {relativeTimeLabel(entry.executed_at, now)}
      </span>
      <span>{formatMs(entry.response.timings.total_ms)} ms</span>
      <span>{humanBytes(entry.response.size_download_bytes)}</span>
    </span>
  );
}
