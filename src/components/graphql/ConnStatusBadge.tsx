import type { SubConnState } from "../../hooks/useSubscription";
import { Icon, type IconName } from "../common/Icon";

interface ConnStatusBadgeProps {
  connState: SubConnState;
}

interface BadgeLook {
  label: string;
  icon: IconName;
  token: string;
}

/** Map a connection state to a label + icon + semantic color token. Icon AND
 *  text always carry the meaning — never color-only (a11y foundation §1.5). */
function lookFor(connState: SubConnState): BadgeLook {
  switch (connState) {
    case "open":
      return { label: "Live", icon: "i-check", token: "var(--lok-status-success)" };
    case "connecting":
      return { label: "Connecting", icon: "i-refresh", token: "var(--lok-status-info)" };
    case "error":
      return { label: "Error", icon: "i-alert", token: "var(--lok-status-danger)" };
    case "closed":
      return { label: "Closed", icon: "i-x", token: "var(--lok-status-neutral)" };
    default:
      return { label: "Idle", icon: "i-clock", token: "var(--lok-status-neutral)" };
  }
}

/** Connection status pill for the subscription stream. Announces changes via the
 *  parent's aria-live region; the dot is paired with a text label + icon. */
export function ConnStatusBadge({ connState }: ConnStatusBadgeProps) {
  const look = lookFor(connState);
  return (
    <span className="sub-conn-badge" style={{ color: look.token }}>
      <span className="dot" aria-hidden style={{ background: look.token }} />
      <Icon name={look.icon} size={12} />
      {look.label}
    </span>
  );
}
