import type { SendState } from "../../hooks/useSendRequest";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface SendButtonProps {
  sendState: SendState;
  disabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}

/** The signature action. Heat gradient when idle/terminal; while in flight it
 *  animates and turns into a Cancel affordance (calls cancel_request). */
export function SendButton({
  sendState,
  disabled,
  onSend,
  onCancel,
}: SendButtonProps) {
  const t = useT();
  const busy =
    sendState.phase === "interpolating" || sendState.phase === "in-flight";

  if (busy) {
    return (
      <button
        type="button"
        className="lok-btn lok-btn--lg lok-btn--primary btn-send lok-heat-gradient--animated"
        aria-label={t("workbench.cancelRequest")}
        aria-busy={true}
        onClick={onCancel}
      >
        <Icon name="i-x" size={17} />
        {t("workbench.sending")}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="lok-btn lok-btn--lg lok-btn--primary btn-send"
      aria-label={t("workbench.sendAria")}
      disabled={disabled}
      onClick={onSend}
    >
      <Icon name="i-send" size={17} />
      {t("workbench.send")}
      <kbd className="kbd lok-kbd-chip">⌘↵</kbd>
    </button>
  );
}
