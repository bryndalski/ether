import type { SendState } from "../../hooks/useSendRequest";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface RunButtonProps {
  sendState: SendState;
  disabled: boolean;
  onRun: () => void;
  onCancel: () => void;
}

/** Runs the GraphQL operation through the shared send lifecycle. Heat gradient
 *  when idle/terminal; while in flight it animates and becomes Cancel. Mirrors
 *  workbench/SendButton but labelled for the GraphQL context. */
export function RunButton({ sendState, disabled, onRun, onCancel }: RunButtonProps) {
  const t = useT();
  const busy =
    sendState.phase === "interpolating" || sendState.phase === "in-flight";

  if (busy) {
    return (
      <button
        type="button"
        className="btn-send lok-heat-gradient--animated"
        aria-label={t("graphql.cancelOperation")}
        aria-busy={true}
        onClick={onCancel}
      >
        <Icon name="i-x" size={15} />
        {t("graphql.running")}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-send"
      aria-label={t("graphql.runOperation")}
      disabled={disabled}
      onClick={onRun}
    >
      <Icon name="i-play" size={13} />
      {t("graphql.run")}
      <kbd className="kbd">⌘↵</kbd>
    </button>
  );
}
