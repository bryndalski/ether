import type { AuthType } from "../../lib/auth";

interface AuthTypeSelectProps {
  type: AuthType;
  onChange: (type: AuthType) => void;
}

const TYPES: { value: AuthType; label: string }[] = [
  { value: "none", label: "No Auth" },
  { value: "bearer", label: "Bearer" },
  { value: "basic", label: "Basic" },
  { value: "api_key", label: "API Key" },
  { value: "sig_v4", label: "AWS SigV4" },
];

/** Auth type select styled like the method chip container. */
export function AuthTypeSelect({ type, onChange }: AuthTypeSelectProps) {
  return (
    <div className="method-select" style={{ marginBottom: "var(--lok-space-3)" }}>
      <span className="method" style={{ color: "var(--lok-text-secondary)" }}>
        {TYPES.find((entry) => entry.value === type)?.label ?? "No Auth"}
      </span>
      <select
        aria-label="Typ autoryzacji"
        value={type}
        onChange={(event) => onChange(event.target.value as AuthType)}
      >
        {TYPES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </div>
  );
}
