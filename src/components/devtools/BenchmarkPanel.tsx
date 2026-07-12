import type { BenchConfig, BenchState } from "../../hooks/useBenchmark";
import { TimelineWaterfall } from "../response/TimelineWaterfall";
import { BenchmarkLauncher } from "./BenchmarkLauncher";
import { BenchmarkProgress } from "./BenchmarkProgress";
import { BenchmarkStats } from "./BenchmarkStats";
import { LatencyHistogram } from "./LatencyHistogram";

interface BenchmarkPanelProps {
  benchState: BenchState;
  host: string;
  isProd: boolean;
  hasRedactedSecrets: boolean;
  onRun: (config: BenchConfig) => void;
  onCancel: () => void;
  onSelectSample: (index: number) => void;
}

/** The `Bench` dock tab. Idle → launcher (warning gate); running → progress;
 *  done/canceled → stats + histogram + the selected sample's waterfall. */
export function BenchmarkPanel({
  benchState,
  host,
  isProd,
  hasRedactedSecrets,
  onRun,
  onCancel,
  onSelectSample,
}: BenchmarkPanelProps) {
  const { phase, config, completed, samples, stats, selectedIndex } = benchState;
  const errorCount = samples.filter((sample) => !sample.ok).length;
  const selectedSample =
    selectedIndex != null
      ? samples.find((sample) => sample.index === selectedIndex)
      : undefined;

  return (
    <div className="dv-panel">
      {phase === "idle" && (
        <BenchmarkLauncher
          host={host}
          isProd={isProd}
          hasRedactedSecrets={hasRedactedSecrets}
          onRun={onRun}
        />
      )}

      {phase === "running" && (
        <BenchmarkProgress
          completed={completed}
          iterations={config.iterations}
          onCancel={onCancel}
        />
      )}

      {(phase === "done" || phase === "canceled") && stats && (
        <>
          {phase === "canceled" && (
            <p className="dv-note">Anulowano — statystyki z {stats.count} prób.</p>
          )}
          <BenchmarkStats stats={stats} errorCount={errorCount} />
          <LatencyHistogram
            samples={samples}
            stats={stats}
            selectedIndex={selectedIndex}
            onSelectSample={onSelectSample}
          />
          {selectedSample && (
            <div className="dv-sample-waterfall">
              <div className="dv-sample-head lok-tnums">
                Próba {selectedSample.index + 1} · {selectedSample.status}
              </div>
              <TimelineWaterfall timings={selectedSample.timings} />
            </div>
          )}
        </>
      )}

      {phase === "error" && (
        <p className="dv-note dv-note-danger">
          Benchmark nie powiódł się: {benchState.error}
        </p>
      )}
    </div>
  );
}
