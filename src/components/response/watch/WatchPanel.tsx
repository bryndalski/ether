import type { UseWatchMode } from "../../../hooks/useWatchMode";
import { MAX_INTERVAL, MIN_INTERVAL } from "../../../hooks/useWatchMode";
import { Icon } from "../../common/Icon";
import { WatchRunRow } from "./WatchRunRow";

interface WatchPanelProps {
  watch: UseWatchMode;
}

/** Watch tab body: the persistent hit-the-endpoint warning, interval + trigger
 *  controls, Stop, and the recent-runs list. */
export function WatchPanel({ watch }: WatchPanelProps) {
  const { watching, runs, start, stop, config, setConfig } = watch;

  return (
    <div className="watch-panel lok-scroll" role="tabpanel" aria-label="Watch">
      {watching && (
        <div className="watch-warn" role="status" aria-live="polite">
          <Icon name="i-flame" size={14} />
          Watch aktywny — request jest wysyłany co {config.intervalSec} s. Uderza w
          prawdziwy endpoint (limity, koszty, skutki uboczne dla POST/PUT/DELETE).
        </div>
      )}
      <div className="watch-controls">
        <label className="watch-interval">
          Interwał
          <input
            type="number"
            className="test-field lok-tnums"
            min={MIN_INTERVAL}
            max={MAX_INTERVAL}
            value={config.intervalSec}
            aria-label="Interwał w sekundach"
            onChange={(event) => setConfig({ intervalSec: Number(event.target.value) })}
          />
          s
        </label>
        <label className="watch-toggle">
          <input
            type="checkbox"
            checked={config.onInterval}
            onChange={(event) => setConfig({ onInterval: event.target.checked })}
          />
          Co interwał
        </label>
        <label className="watch-toggle">
          <input
            type="checkbox"
            checked={config.onDraftChange}
            onChange={(event) => setConfig({ onDraftChange: event.target.checked })}
          />
          Przy zmianie
        </label>
        {watching ? (
          <button type="button" className="snap-btn danger" aria-label="Zatrzymaj watch" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className="snap-btn primary" aria-label="Uruchom watch" onClick={start}>
            Start
          </button>
        )}
      </div>
      <div className="watch-runs">
        {runs.length === 0 ? (
          <p className="test-hint">Brak przebiegów — włącz watch, by je zebrać.</p>
        ) : (
          runs.map((run) => <WatchRunRow key={run.at} run={run} />)
        )}
      </div>
    </div>
  );
}
