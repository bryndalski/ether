import type { KeyValue, ScrubConfig } from "../../../lib/types";
import { KeyValueTable } from "../KeyValueTable";
import { useT } from "../../../i18n/useT";

interface SnapshotConfigCardProps {
  config: ScrubConfig;
  onChange: (config: ScrubConfig) => void;
}

/** Scrub-config editor: JSONPaths to scrub + auto timestamp/uuid toggles. The
 *  paths are edited as a single-column KV list (value only). Persisted with the
 *  snapshot on Save/Accept, not here. */
export function SnapshotConfigCard({ config, onChange }: SnapshotConfigCardProps) {
  const t = useT();
  const rows: KeyValue[] = config.paths.map((path) => ({
    name: path,
    value: "",
    enabled: true,
  }));

  return (
    <div className="snap-config">
      <h3 className="test-heading">{t("snapshot.scrubHeading")}</h3>
      <p className="test-hint">{t("snapshot.scrubPaths")}</p>
      <KeyValueTable
        rows={rows}
        keyHeader="JSONPath"
        valueHeader=""
        keyPlaceholder="$.data.createdAt"
        keyClassName="k mono"
        onChange={(next) =>
          onChange({ ...config, paths: next.map((row) => row.name).filter((p) => p !== "") })
        }
      />
      <label className="snap-toggle">
        <input
          type="checkbox"
          checked={config.auto_timestamps}
          onChange={(event) => onChange({ ...config, auto_timestamps: event.target.checked })}
        />
        {t("snapshot.autoScrubTimestamps")}
      </label>
      <label className="snap-toggle">
        <input
          type="checkbox"
          checked={config.auto_uuids}
          onChange={(event) => onChange({ ...config, auto_uuids: event.target.checked })}
        />
        {t("snapshot.autoScrubUuids")}
      </label>
    </div>
  );
}
