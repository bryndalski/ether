import type { UseWatchMode } from "../../../hooks/useWatchMode";
import { MAX_INTERVAL, MIN_INTERVAL } from "../../../hooks/useWatchMode";
import { Icon } from "../../common/Icon";
import { WatchRunRow } from "./WatchRunRow";
import { useT } from "../../../i18n/useT";

interface WatchPanelProps {
  watch: UseWatchMode;
}

/** Watch tab body: the persistent hit-the-endpoint warning, interval + trigger
 *  controls, Stop, and the recent-runs list. */
export function WatchPanel({ watch }: WatchPanelProps) {
  const { watching, runs, start, stop, config, setConfig } = watch;
  const t = useT();

  return (
    <div className="watch-panel lok-scroll" role="tabpanel" aria-label={t("watch.tabAria")}>
      {watching && (
        <div className="watch-warn" role="status" aria-live="polite">
          <Icon name="i-flame" size={14} />
          {t("watch.active", { interval: config.intervalSec })}{" "}
          {t("watch.activeTail")}
        </div>
      )}
      <div className="watch-controls">
        <label className="watch-interval">
          {t("watch.interval")}
          <input
            type="number"
            className="test-field lok-tnums"
            min={MIN_INTERVAL}
            max={MAX_INTERVAL}
            value={config.intervalSec}
            aria-label={t("watch.intervalSeconds")}
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
          {t("watch.perInterval")}
        </label>
        <label className="watch-toggle">
          <input
            type="checkbox"
            checked={config.onDraftChange}
            onChange={(event) => setConfig({ onDraftChange: event.target.checked })}
          />
          {t("watch.onChange")}
        </label>
        {watching ? (
          <button type="button" className="snap-btn danger" aria-label={t("watch.stopWatch")} onClick={stop}>
            {t("watch.stop")}
          </button>
        ) : (
          <button type="button" className="snap-btn primary" aria-label={t("watch.startWatch")} onClick={start}>
            {t("watch.start")}
          </button>
        )}
      </div>
      <div className="watch-runs">
        {runs.length === 0 ? (
          <p className="test-hint">{t("watch.noRuns")}</p>
        ) : (
          runs.map((run) => <WatchRunRow key={run.at} run={run} />)
        )}
      </div>
    </div>
  );
}
