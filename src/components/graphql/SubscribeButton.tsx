import type { SubConnState } from "../../hooks/useSubscription";
import { Icon, type IconName } from "../common/Icon";

interface SubscribeButtonProps {
  connState: SubConnState;
  disabled: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}

interface ButtonLook {
  label: string;
  icon: IconName;
  animated: boolean;
  busy: boolean;
  primary: boolean; // true → the action is Subscribe/Retry; false → Unsubscribe
}

/** Map the connection state to the button's look + which handler fires. Kept
 *  pure so the view below stays a dumb render. */
function lookFor(connState: SubConnState): ButtonLook {
  switch (connState) {
    case "connecting":
      return { label: "Connecting…", icon: "i-refresh", animated: true, busy: true, primary: false };
    case "open":
      return { label: "Unsubscribe", icon: "i-x", animated: true, busy: false, primary: false };
    case "error":
      return { label: "Retry", icon: "i-alert", animated: false, busy: false, primary: true };
    default: // idle / closed
      return { label: "Subscribe", icon: "i-play", animated: false, busy: false, primary: true };
  }
}

/** The subscription sibling of RunButton (1 component = 1 file): a
 *  Subscribe/Unsubscribe/Connecting/Retry toggle driven by SubConnState. Label +
 *  icon always present (never color-only); aria-busy while connecting. */
export function SubscribeButton({
  connState,
  disabled,
  onSubscribe,
  onUnsubscribe,
}: SubscribeButtonProps) {
  const look = lookFor(connState);
  const onClick = look.primary ? onSubscribe : onUnsubscribe;
  const className = look.animated
    ? "btn-send lok-heat-gradient--animated"
    : "btn-send";
  return (
    <button
      type="button"
      className={className}
      aria-label={look.label}
      aria-busy={look.busy}
      disabled={disabled && look.primary}
      onClick={onClick}
    >
      <Icon name={look.icon} size={13} />
      {look.label}
    </button>
  );
}
