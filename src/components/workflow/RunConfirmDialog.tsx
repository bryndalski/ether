import { useRef } from "react";
import { useT } from "../../i18n/useT";
import { useFocusTrap } from "../../hooks/useFocusTrap";

/** The loud real-request confirm before a run. The env name is colored with the
 *  env accent so a prod run reads as dangerous (red). Confirm → run; Cancel/Esc →
 *  close. A run makes REAL network calls, so this gate is mandatory. */
export function RunConfirmDialog({
  envName,
  onConfirm,
  onCancel,
}: {
  envName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onClose: onCancel });

  return (
    <div className="lok-wf-confirm__backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={ref}
        className="lok-wf-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={t("workflow.runConfirmTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="lok-wf-confirm__title">{t("workflow.runConfirmTitle")}</h2>
        <p className="lok-wf-confirm__body">
          {envName
            ? t("workflow.runConfirmBody", { env: "" })
            : t("workflow.runConfirmNoEnv")}
          {envName && <strong className="lok-wf-confirm__env">{envName}</strong>}
        </p>
        <div className="lok-wf-confirm__actions">
          <button type="button" className="lok-wf-confirm__cancel" onClick={onCancel}>
            {t("workflow.runConfirmCancel")}
          </button>
          <button
            type="button"
            className="lok-wf-confirm__confirm"
            onClick={onConfirm}
            autoFocus
          >
            {t("workflow.runConfirmConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
