import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useEnvManager } from "../../hooks/useEnvManager";
import { Icon } from "../common/Icon";
import { EnvList } from "./EnvList";
import { EnvEditor } from "./EnvEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import "./env.css";

/** Modal panel to manage environments (base + sub), their public variables, and
 *  the NAMES of their secrets. Mounts when useUiStore.envManagerOpen is true;
 *  focus-trapped, Esc closes, focus returns to the invoking control. */
export function EnvironmentManager() {
  const open = useUiStore((state) => state.envManagerOpen);
  const close = useUiStore((state) => state.closeEnvManager);
  const manager = useEnvManager();
  const cardRef = useRef<HTMLDivElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const deleteTarget = manager.environments.find((e) => e.id === deleteId);

  return (
    <div
      className="env-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={cardRef}
        className="env-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Zarządzanie środowiskami"
        tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className="env-modal-head">
          <span className="env-modal-title">Środowiska</span>
          <button
            type="button"
            className="env-modal-close"
            aria-label="Zamknij"
            onClick={close}
          >
            <Icon name="i-x" size={16} />
          </button>
        </div>

        <div className="env-modal-body">
          <EnvList
            environments={manager.environments}
            selectedEnvId={manager.selectedEnvId}
            onSelect={manager.selectEnv}
            onCreate={manager.createEnvironment}
            onRequestDelete={setDeleteId}
          />
          {manager.selectedEnv ? (
            <EnvEditor
              environment={manager.selectedEnv}
              environments={manager.environments}
              onPatch={manager.patch}
            />
          ) : (
            <div className="env-editor">
              <p style={{ color: "var(--lok-text-tertiary)" }}>
                Wybierz lub utwórz środowisko, by je edytować.
              </p>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={`Usunąć środowisko „${deleteTarget.name}"?`}
          message="Podśrodowiska i zmienne zostaną usunięte. Sekretów nie usuwa się automatycznie z Keychain."
          onConfirm={() => {
            void manager.removeEnvironment(deleteTarget.id);
            setDeleteId(null);
          }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
