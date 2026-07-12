import type { BodyMode } from "../../lib/bodyMode";

interface BodyModeSelectProps {
  mode: BodyMode;
  onChange: (mode: BodyMode) => void;
}

const MODES: { value: BodyMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "raw-json", label: "JSON" },
  { value: "raw-xml", label: "XML" },
  { value: "raw-text", label: "Text" },
  { value: "form", label: "Form" },
  { value: "multipart", label: "Multipart" },
];

/** Body mode select styled like the method chip container. */
export function BodyModeSelect({ mode, onChange }: BodyModeSelectProps) {
  return (
    <div className="method-select" style={{ marginBottom: "var(--lok-space-3)" }}>
      <span className="method" style={{ color: "var(--lok-text-secondary)" }}>
        {MODES.find((entry) => entry.value === mode)?.label ?? "None"}
      </span>
      <select
        aria-label="Tryb treści"
        value={mode}
        onChange={(event) => onChange(event.target.value as BodyMode)}
      >
        {MODES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </div>
  );
}
