import { useState } from "react";
import { useSecrets } from "../../hooks/useSecrets";
import { Icon } from "../common/Icon";
import { SecretStatusBadge } from "./SecretStatusBadge";
import { SetSecretDialog } from "./SetSecretDialog";
import { useT } from "../../i18n/useT";

interface SecretNamesListProps {
  names: string[];
  onNamesChange: (names: string[]) => void;
  /** Purge the Keychain value when a name is removed to avoid orphans. */
  onPurge: (name: string) => Promise<void>;
}

/** The secret_names of an environment. A secret is a NAME here; its value is
 *  never in this component's state — only its Keychain status (set/empty). */
export function SecretNamesList({
  names,
  onNamesChange,
  onPurge,
}: SecretNamesListProps) {
  const secrets = useSecrets(names);
  const t = useT();
  const [newName, setNewName] = useState("");
  const [settingFor, setSettingFor] = useState<string | null>(null);

  function addName() {
    const name = newName.trim();
    if (name === "" || names.includes(name)) return;
    onNamesChange([...names, name]);
    setNewName("");
  }

  async function removeName(name: string) {
    onNamesChange(names.filter((n) => n !== name));
    await onPurge(name); // secret_delete so no orphaned Keychain entry
  }

  return (
    <section aria-label={t("secrets.envSecrets")}>
      <div className="keychain-warn" role="note" style={{ marginBottom: 8 }}>
        <Icon name="i-shield" size={16} />
        <span>{t("secrets.livesInKeychain")}</span>
      </div>

      {names.length === 0 ? (
        <p style={{ color: "var(--lok-text-tertiary)", fontSize: "var(--lok-fs-xs)" }}>
          {t("secrets.noSecrets")}
        </p>
      ) : (
        <div className="kv-grid secret-grid">
          {names.map((name) => (
            <div className="kv-row" key={name}>
              <span className="secret-name">{name}</span>
              <SecretStatusBadge status={secrets.statusOf(name)} />
              <span className="kv-actions">
                <button
                  type="button"
                  className="kv-iconbtn"
                  aria-label={t("secrets.setValue", { name })}
                  onClick={() => setSettingFor(name)}
                >
                  <Icon name="i-lock" size={13} />
                </button>
                <button
                  type="button"
                  className="kv-iconbtn danger"
                  aria-label={t("secrets.deleteSecret", { name })}
                  onClick={() => void removeName(name)}
                >
                  <Icon name="i-trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="secret-add">
        <input
          type="text"
          aria-label={t("secrets.newSecretName")}
          placeholder={t("secrets.newSecretPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addName();
            }
          }}
        />
        <button
          type="button"
          className="env-btn ghost"
          aria-label={t("secrets.addSecret")}
          onClick={addName}
        >
          <Icon name="i-plus" size={14} />
        </button>
      </div>

      {settingFor && (
        <SetSecretDialog
          name={settingFor}
          onSubmit={secrets.setSecret}
          onDone={() => setSettingFor(null)}
        />
      )}
    </section>
  );
}
