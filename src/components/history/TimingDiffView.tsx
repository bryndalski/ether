import { formatMs } from "../../lib/format";
import type { PhaseDelta } from "../../lib/timingDiff";
import { useT, type TranslateFn } from "../../i18n/useT";

interface TimingDiffViewProps {
  deltas: PhaseDelta[];
}

const PHASE_LABEL: Record<string, string> = {
  dns: "DNS",
  connect: "Connect",
  tls: "TLS",
  ttfb: "TTFB",
  download: "Download",
  total: "Total",
};

function pct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

function deltaLabel(t: TranslateFn, row: PhaseDelta): string {
  if (row.deltaMs === 0) return t("diff.noChange");
  return row.faster ? t("diff.faster") : t("diff.slower");
}

/** Per-phase + total timing deltas. Δ is colored green (faster) / red (slower) /
 *  neutral, but the faster/slower text carries the meaning too. */
export function TimingDiffView({ deltas }: TimingDiffViewProps) {
  const t = useT();
  return (
    <div className="diff-body lok-scroll" role="region" aria-label={t("diff.timingsDiffRegion")}>
      <div className="diff-timing head lok-tnums">
        <span>{t("diff.phase")}</span>
        <span>A (ms)</span>
        <span>B (ms)</span>
        <span>Δ (ms)</span>
        <span>%</span>
      </div>
      {deltas.map((row) => {
        const deltaClass = row.deltaMs === 0 ? "" : row.faster ? "delta-faster" : "delta-slower";
        const sign = row.deltaMs > 0 ? "+" : row.deltaMs < 0 ? "−" : "";
        return (
          <div
            key={row.phase}
            className="diff-timing lok-tnums"
            aria-label={t("diff.timingRowAria", {
              phase: PHASE_LABEL[row.phase],
              trend: deltaLabel(t, row),
              delta: formatMs(Math.abs(row.deltaMs)),
            })}
          >
            <span>{PHASE_LABEL[row.phase]}</span>
            <span>{formatMs(row.beforeMs)}</span>
            <span>{formatMs(row.afterMs)}</span>
            <span className={deltaClass}>
              {sign}
              {formatMs(Math.abs(row.deltaMs))}
            </span>
            <span className={deltaClass}>{pct(row.pctChange)}</span>
          </div>
        );
      })}
    </div>
  );
}
