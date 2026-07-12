import type { SendState } from "../../hooks/useSendRequest";
import { Icon } from "../common/Icon";

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
  const busy =
    sendState.phase === "interpolating" || sendState.phase === "in-flight";

  if (busy) {
    return (
      <button
        type="button"
        className="btn-send lok-heat-gradient--animated"
        aria-label="Anuluj operację"
        aria-busy={true}
        onClick={onCancel}
      >
        <Icon name="i-x" size={15} />
        Running…
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-send"
      aria-label="Uruchom operację GraphQL"
      disabled={disabled}
      onClick={onRun}
    >
      <Icon name="i-play" size={13} />
      Run
      <kbd className="kbd">⌘↵</kbd>
    </button>
  );
}
