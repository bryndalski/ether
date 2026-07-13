import { useRef, useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useEnvManager } from "../../hooks/useEnvManager";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Icon } from "../common/Icon";
import { EnvList } from "./EnvList";
import { EnvEditor } from "./EnvEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "../common/EmptyState";
import { useT } from "../../i18n/useT";
import "../common/kv-grid.css";
import "./env.css";

/** Modal panel to manage environments (base + sub), their public variables, and
 *  the NAMES of their secrets. Mounts when useUiStore.envManagerOpen is true;
 *  focus-trapped, Esc closes, focus returns to the invoking control. */
export function EnvironmentManager() {
  const open = useUiStore((state) => state.envManagerOpen);
  const close = useUiStore((state) => state.closeEnvManager);
  const manager = useEnvManager();
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useFocusTrap(cardRef, { active: open, onClose: close });

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
        aria-label={t("env.manageAria")}
        tabIndex={-1}
      >
        <div className="env-modal-head">
          <span className="env-modal-title">{t("env.title")}</span>
          <button
            type="button"
            className="env-modal-close"
            aria-label={t("env.close")}
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
          {manager.environments.length === 0 ? (
            <div className="env-editor" style={{ justifyContent: "center" }}>
              <EmptyState
                glow
                headline={t("env.noEnvironments")}
                hint={t("env.pickOrCreate")}
                actionLabel={t("env.newEnvironment")}
                onAction={() => void manager.createEnvironment(null)}
                icon="🌐"
              />
            </div>
          ) : manager.selectedEnv ? (
            <EnvEditor
              environment={manager.selectedEnv}
              environments={manager.environments}
              onPatch={manager.patch}
            />
          ) : (
            <div className="env-editor">
              <p style={{ color: "var(--lok-text-tertiary)" }}>
                {t("env.pickOrCreate")}
              </p>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={t("env.deleteConfirmTitle", { name: deleteTarget.name })}
          message={t("env.deleteConfirmMessage")}
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
