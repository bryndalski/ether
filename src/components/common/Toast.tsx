import { useEffect } from "react";
import { useToast, type ToastItem } from "../../state/useToast";
import { Icon, type IconName } from "./Icon";
import { useT } from "../../i18n/useT";
import "./toast.css";

const AUTO_DISMISS_MS = 2400;

const ICON_BY_VARIANT: Record<ToastItem["variant"], IconName> = {
  success: "i-check",
  danger: "i-alert",
  warn: "i-alert",
  info: "i-flame",
};

function ToastRow({ toast }: { toast: ToastItem }) {
  const dismiss = useToast((state) => state.dismiss);
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const danger = toast.variant === "danger";
  return (
    <div
      className="lok-toast"
      data-variant={toast.variant}
      role={danger ? "alert" : "status"}
      aria-live={danger ? "assertive" : "polite"}
    >
      <span className="lok-toast-icon" aria-hidden>
        <Icon name={ICON_BY_VARIANT[toast.variant]} size={14} />
      </span>
      <span className="lok-toast-msg">{toast.message}</span>
      <button
        type="button"
        className="lok-toast-close"
        aria-label={t("toast.dismissNotification")}
        onClick={() => dismiss(toast.id)}
      >
        <Icon name="i-x" size={13} />
      </button>
    </div>
  );
}

/** Renders the live toast stack. Mounted once in AppShell. */
export function Toast() {
  const toasts = useToast((state) => state.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="lok-toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
