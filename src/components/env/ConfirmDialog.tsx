import { useEffect, useRef } from "react";
import { useT } from "../../i18n/useT";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small focus-trapped confirm dialog, shared by env / collection / request
 *  deletes. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const confirmLabelText = confirmLabel ?? t("common.delete");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      className="env-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => event.key === "Escape" && onCancel()}
    >
      <div className="env-dialog-card">
        <p className="env-dialog-title">{title}</p>
        <p style={{ color: "var(--lok-text-secondary)", fontSize: "var(--lok-fs-sm)" }}>
          {message}
        </p>
        <div className="env-dialog-actions">
          <button type="button" className="env-btn ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`env-btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
          >
            {confirmLabelText}
          </button>
        </div>
      </div>
    </div>
  );
}
