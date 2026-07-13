import { useState } from "react";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface SetSecretDialogProps {
  name: string;
  onSubmit: (name: string, value: string) => Promise<void>;
  onDone: () => void;
}

/** Set a secret's value. The value lives only in this component's local state
 *  while typing, is passed once to secret_set, then cleared — it is never
 *  rendered back, logged, or stored. A Keychain warning is always visible. */
export function SetSecretDialog({ name, onSubmit, onDone }: SetSecretDialogProps) {
  const t = useT();
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
      aria-label={t("secrets.saveSecretAria", { name })}
      onKeyDown={(event) => event.key === "Escape" && onDone()}
    >
      <div className="env-dialog-card">
        <p className="env-dialog-title">{t("secrets.setSecretTitle", { name })}</p>

        <div className="keychain-warn" role="note">
          <Icon name="i-shield" size={16} />
          <span>{t("secrets.keychainNote")}</span>
        </div>

        <input
          type="password"
          autoComplete="off"
          autoFocus
          aria-label={t("secrets.secretValue", { name })}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving && value !== "") {
              event.preventDefault();
              void handleSave();
            }
          }}
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
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="env-btn primary"
            disabled={saving || value === ""}
            onClick={handleSave}
          >
            {t("secrets.saveToKeychain")}
          </button>
        </div>
      </div>
    </div>
  );
}
