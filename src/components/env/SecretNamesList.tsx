import { useState } from "react";
import { useSecrets } from "../../hooks/useSecrets";
import { Icon } from "../common/Icon";
import { SecretStatusBadge } from "./SecretStatusBadge";
import { SetSecretDialog } from "./SetSecretDialog";

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
    <section aria-label="Sekrety środowiska">
      <div className="keychain-warn" role="note" style={{ marginBottom: 8 }}>
        <Icon name="i-shield" size={16} />
        <span>
          Sekrety żyją w macOS Keychain — Lokówka może je ustawić lub usunąć,
          ale nigdy odczytać ich wartości.
        </span>
      </div>

      {names.length === 0 && (
        <p style={{ color: "var(--lok-text-tertiary)", fontSize: "var(--lok-fs-xs)" }}>
          Brak sekretów.
        </p>
      )}

      {names.map((name) => (
        <div className="secret-row" key={name}>
          <span className="secret-name">{name}</span>
          <SecretStatusBadge status={secrets.statusOf(name)} />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Ustaw wartość ${name}`}
            onClick={() => setSettingFor(name)}
          >
            <Icon name="i-lock" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Usuń sekret ${name}`}
            onClick={() => void removeName(name)}
          >
            <Icon name="i-trash" size={14} />
          </button>
        </div>
      ))}

      <div className="secret-add">
        <input
          type="text"
          aria-label="Nazwa nowego sekretu"
          placeholder="NAZWA_SEKRETU"
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
          aria-label="Dodaj sekret"
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
