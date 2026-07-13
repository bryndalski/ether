import type { BenchStats } from "../../lib/percentile";
import { formatMs } from "../../lib/format";
import { useT } from "../../i18n/useT";

interface BenchmarkStatsProps {
  stats: BenchStats;
  errorCount: number;
}

const CARDS: { key: keyof BenchStats; label: string }[] = [
  { key: "p50", label: "p50" },
  { key: "p95", label: "p95" },
  { key: "p99", label: "p99" },
  { key: "min", label: "min" },
  { key: "max", label: "max" },
  { key: "avg", label: "avg" },
];

/** Six stat cards (p50/p95/p99/min/max/avg), all tabular-nums, plus a small
 *  count/error footer. Pure view — numbers come from benchStats. */
export function BenchmarkStats({ stats, errorCount }: BenchmarkStatsProps) {
  const t = useT();
  return (
    <div>
      <div className="dv-statgrid">
        {CARDS.map(({ key, label }) => (
          <div className="dv-statcard" key={key}>
            <span className="dv-statlabel">{label}</span>
            <span className="dv-statval lok-tnums">
              {formatMs(stats[key] as number)}
              <span className="dv-statunit"> ms</span>
            </span>
          </div>
        ))}
      </div>
      <div className="dv-statfoot lok-tnums">
        {t("devtools.samples", { count: stats.count })}
        {errorCount > 0 && (
          <span className="dv-staterr">{t("devtools.errors", { count: errorCount })}</span>
        )}
      </div>
    </div>
  );
}
