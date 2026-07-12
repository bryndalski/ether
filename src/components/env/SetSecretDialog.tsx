import { useState } from "react";
import { Icon } from "../common/Icon";

interface SetSecretDialogProps {
  name: string;
  onSubmit: (name: string, value: string) => Promise<void>;
  onDone: () => void;
}

/** Set a secret's value. The value lives only in this component's local state
 *  while typing, is passed once to secret_set, then cleared — it is never
 *  rendered back, logged, or stored. A Keychain warning is always visible. */
export function SetSecretDialog({ name, onSubmit, onDone }: SetSecretDialogProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name, value);
      setValue(""); // redact from state on success
      onDone();
    } catch (err) {
      setValue(""); // still clear the value on failure
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="env-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`Zapisz sekret ${name}`}
      onKeyDown={(event) => event.key === "Escape" && onDone()}
    >
      <div className="env-dialog-card">
        <p className="env-dialog-title">Ustaw sekret: {name}</p>

        <div className="keychain-warn" role="note">
          <Icon name="i-shield" size={16} />
          <span>
            Wartość zostanie zapisana w macOS Keychain i nigdy nie wraca do
            aplikacji. Lokówka nie może jej odczytać ani wyświetlić.
          </span>
        </div>

        <input
          type="password"
          autoComplete="off"
          autoFocus
          aria-label={`Wartość sekretu ${name}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="env-field"
          style={{
            background: "var(--lok-bg-input)",
            color: "var(--lok-text-primary)",
            border: "1px solid var(--lok-border-default)",
            borderRadius: "var(--lok-radius-sm)",
            padding: "6px var(--lok-space-2)",
            fontSize: "var(--lok-fs-sm)",
          }}
        />

        {error && (
          <p className="env-error" aria-live="polite">
            {error}
          </p>
        )}

        <div className="env-dialog-actions">
          <button type="button" className="env-btn ghost" onClick={onDone}>
            Anuluj
          </button>
          <button
            type="button"
            className="env-btn primary"
            disabled={saving || value === ""}
            onClick={handleSave}
          >
            Zapisz do Keychain
          </button>
        </div>
      </div>
    </div>
  );
}
