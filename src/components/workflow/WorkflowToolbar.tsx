import { useT } from "../../i18n/useT";
import type { RunState } from "../../lib/workflow";

/** The editor toolbar: workflow name, Save (with a dirty indicator), and the
 *  Run/Stop control with the live run-state label + the real-request warning.
 *  Purely presentational — all handlers are passed in from the editor. */
export function WorkflowToolbar({
  name,
  dirty,
  runState,
  onNameChange,
  onSave,
  onRun,
  onStop,
}: {
  name: string;
  dirty: boolean;
  runState: RunState;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const t = useT();
  const running = runState === "running";

  const runStateLabel: Record<RunState, string> = {
    idle: t("workflow.runStateIdle"),
    running: t("workflow.runStateRunning"),
    done: t("workflow.runStateDone"),
    failed: t("workflow.runStateFailed"),
    stopped: t("workflow.runStateStopped"),
  };

  return (
    <div className="lok-wf-toolbar">
      <input
        className="lok-input lok-wf-toolbar__name"
        type="text"
        value={name}
        placeholder={t("workflow.namePlaceholder")}
        aria-label={t("workflow.nameLabel")}
        onChange={(e) => onNameChange(e.target.value)}
      />

      <span className="lok-wf-toolbar__live" title={t("workflow.liveWarning")}>
        {t("workflow.liveWarning")}
      </span>

      <span
        className="lok-wf-toolbar__runstate"
        data-state={runState}
        aria-live="polite"
      >
        {runStateLabel[runState]}
      </span>

      <button
        type="button"
        className="lok-btn lok-btn--md lok-btn--neutral lok-wf-toolbar__save"
        onClick={onSave}
      >
        {dirty ? `${t("workflow.save")} *` : t("workflow.saved")}
      </button>

      {running ? (
        <button
          type="button"
          className="lok-btn lok-btn--md lok-btn--danger lok-wf-toolbar__stop"
          onClick={onStop}
        >
          {t("workflow.stop")}
        </button>
      ) : (
        <button
          type="button"
          className="lok-btn lok-btn--lg lok-btn--primary lok-wf-toolbar__run"
          onClick={onRun}
        >
          {t("workflow.run")}
        </button>
      )}
    </div>
  );
}
