import { histogramBins } from "../../lib/histogram";
import type { BenchStats } from "../../lib/percentile";
import type { BenchSample } from "../../hooks/useBenchmark";
import { formatMs } from "../../lib/format";

interface LatencyHistogramProps {
  samples: BenchSample[];
  stats: BenchStats;
  selectedIndex: number | null;
  onSelectSample: (index: number) => void;
}

const WIDTH = 520;
const HEIGHT = 200;
const PAD_LEFT = 34;
const PAD_BOTTOM = 24;
const PAD_TOP = 18;
const PAD_RIGHT = 12;

const PERCENTILE_LINES: { key: "p50" | "p95" | "p99"; token: string }[] = [
  { key: "p50", token: "var(--lok-phase-connect)" },
  { key: "p95", token: "var(--lok-status-warn)" },
  { key: "p99", token: "var(--lok-status-danger)" },
];

/** Pure inline-SVG latency histogram: neutral bars + p50/p95/p99 overlay lines
 *  (the stars). Bars are role="button" for click-through to a sample's
 *  waterfall. All numbers tabular-nums; all colors design tokens. */
export function LatencyHistogram({
  samples,
  stats,
  selectedIndex,
  onSelectSample,
}: LatencyHistogramProps) {
  const okSamples = samples.filter((sample) => sample.ok);
  const bins = histogramBins(okSamples.map((sample) => sample.totalMs));
  if (bins.length === 0) return null;

  const min = stats.min;
  const max = stats.max || min + 1;
  const range = max - min || 1;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForMs = (ms: number) => PAD_LEFT + ((ms - min) / range) * plotW;
  const selectedMs =
    selectedIndex != null
      ? okSamples.find((sample) => sample.index === selectedIndex)?.totalMs
      : undefined;

  return (
    <svg
      className="dv-histogram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="group"
      aria-label="Histogram opóźnień z liniami percentyli"
    >
      {/* axes */}
      <line
        x1={PAD_LEFT}
        y1={PAD_TOP}
        x2={PAD_LEFT}
        y2={HEIGHT - PAD_BOTTOM}
        stroke="var(--lok-border-default)"
      />
      <line
        x1={PAD_LEFT}
        y1={HEIGHT - PAD_BOTTOM}
        x2={WIDTH - PAD_RIGHT}
        y2={HEIGHT - PAD_BOTTOM}
        stroke="var(--lok-border-default)"
      />

      {/* bars */}
      {bins.map((bin, index) => {
        const binLeft = xForMs(bin.x0);
        const binRight = xForMs(bin.x1 === bin.x0 ? bin.x0 + range * 0.02 : bin.x1);
        const barW = Math.max(1, binRight - binLeft - 1);
        const barH = (bin.count / maxCount) * plotH;
        const barY = HEIGHT - PAD_BOTTOM - barH;
        const isSelected =
          selectedMs != null && selectedMs >= bin.x0 && selectedMs <= bin.x1;
        // Click selects the first sample whose latency falls in this bin.
        const sampleHere = okSamples.find(
          (sample) => sample.totalMs >= bin.x0 && sample.totalMs <= bin.x1,
        );
        return (
          <rect
            key={index}
            className="dv-histobar"
            x={binLeft}
            y={barY}
            width={barW}
            height={barH}
            rx={1}
            fill={
              isSelected ? "var(--lok-brand-subtle)" : "var(--lok-ink-400)"
            }
            role="button"
            tabIndex={0}
            aria-label={`Kubełek ${formatMs(bin.x0)}–${formatMs(bin.x1)} ms · ${bin.count} prób`}
            onClick={() => sampleHere && onSelectSample(sampleHere.index)}
            onKeyDown={(event) => {
              if (
                (event.key === "Enter" || event.key === " ") &&
                sampleHere
              ) {
                event.preventDefault();
                onSelectSample(sampleHere.index);
              }
            }}
          />
        );
      })}

      {/* percentile overlay lines */}
      {PERCENTILE_LINES.map(({ key, token }) => {
        const value = stats[key];
        const x = xForMs(value);
        return (
          <g key={key}>
            <line
              x1={x}
              y1={PAD_TOP}
              x2={x}
              y2={HEIGHT - PAD_BOTTOM}
              stroke={token}
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <text
              className="dv-histolabel lok-tnums"
              x={Math.min(x + 3, WIDTH - PAD_RIGHT - 46)}
              y={PAD_TOP + 9}
              fill={token}
            >
              {key} {formatMs(value)} ms
            </text>
          </g>
        );
      })}

      {/* x-axis min/max ticks */}
      <text className="dv-axistick lok-tnums" x={PAD_LEFT} y={HEIGHT - 8}>
        {formatMs(min)}
      </text>
      <text
        className="dv-axistick lok-tnums"
        x={WIDTH - PAD_RIGHT}
        y={HEIGHT - 8}
        textAnchor="end"
      >
        {formatMs(max)} ms
      </text>
      {/* y-axis max count */}
      <text className="dv-axistick lok-tnums" x={PAD_LEFT - 6} y={PAD_TOP + 4} textAnchor="end">
        {maxCount}
      </text>
    </svg>
  );
}
