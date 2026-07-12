import { useState } from "react";
import type { BenchConfig } from "../../hooks/useBenchmark";
import { clampConfig } from "../../hooks/useBenchmark";
import { Icon } from "../common/Icon";

interface BenchmarkLauncherProps {
  host: string;
  isProd: boolean;
  hasRedactedSecrets: boolean;
  onRun: (config: BenchConfig) => void;
}

/** The mandatory warning gate. The benchmark NEVER auto-starts — this surface
 *  shows N + concurrency + a loud "this hits your endpoint" warning, and the
 *  only thing that starts the loop is the explicit "Uruchom benchmark" button.
 *  The prod / redacted-secret cases escalate the copy (never silently block). */
export function BenchmarkLauncher({
  host,
  isProd,
  hasRedactedSecrets,
  onRun,
}: BenchmarkLauncherProps) {
  const [iterations, setIterations] = useState(20);
  const [concurrency, setConcurrency] = useState(1);

  const escalate = isProd || hasRedactedSecrets;
  const config = clampConfig({ iterations, concurrency });

  return (
    <div className="dv-launcher">
      <div className="dv-launcher-fields">
        <label className="dv-field">
          <span className="dv-field-label">Liczba prób</span>
          <input
            type="number"
            min={1}
            max={500}
            className="dv-input lok-tnums"
            value={iterations}
            onChange={(event) => setIterations(Number(event.target.value))}
          />
        </label>
        <label className="dv-field">
          <span className="dv-field-label">Równoległość</span>
          <input
            type="number"
            min={1}
            max={4}
            className="dv-input lok-tnums"
            value={concurrency}
            onChange={(event) => setConcurrency(Number(event.target.value))}
          />
        </label>
      </div>

      <div
        className={escalate ? "dv-warn dv-warn-strong" : "dv-warn"}
        role="note"
      >
        <Icon name="i-alert" size={14} />
        <span>
          Benchmark wykona <strong className="lok-tnums">{config.iterations}</strong>{" "}
          realnych requestów na <strong>{host || "endpoint"}</strong>.
          {isProd && " To środowisko PROD — zachowaj ostrożność."}
          {hasRedactedSecrets &&
            " Uwaga: request zawiera zredagowane sekrety (•••)."}
        </span>
      </div>

      <button
        type="button"
        className="dv-btn dv-btn-primary"
        onClick={() => onRun(config)}
      >
        <Icon name="i-flame" size={14} />
        Uruchom benchmark
      </button>
    </div>
  );
}
