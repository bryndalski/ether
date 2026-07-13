import type { KeyValue, ScrubConfig } from "../../../lib/types";
import { KeyValueTable } from "../KeyValueTable";

interface SnapshotConfigCardProps {
  config: ScrubConfig;
  onChange: (config: ScrubConfig) => void;
}

/** Scrub-config editor: JSONPaths to scrub + auto timestamp/uuid toggles. The
 *  paths are edited as a single-column KV list (value only). Persisted with the
 *  snapshot on Save/Accept, not here. */
export function SnapshotConfigCard({ config, onChange }: SnapshotConfigCardProps) {
  const rows: KeyValue[] = config.paths.map((path) => ({
    name: path,
    value: "",
    enabled: true,
  }));

  return (
    <div className="snap-config">
      <h3 className="test-heading">Snapshot — pola do scrubowania</h3>
      <p className="test-hint">
        Ścieżki JSONPath pomijane przy porównaniu wzorca (np. znaczniki czasu, id).
      </p>
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
        Auto-scrub znaczników czasu (ISO-8601)
      </label>
      <label className="snap-toggle">
        <input
          type="checkbox"
          checked={config.auto_uuids}
          onChange={(event) => onChange({ ...config, auto_uuids: event.target.checked })}
        />
        Auto-scrub UUID (RFC-4122)
      </label>
    </div>
  );
}
