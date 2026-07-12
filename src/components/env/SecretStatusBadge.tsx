import type { SecretStatus } from "../../hooks/useSecrets";
import { Icon } from "../common/Icon";

interface SecretStatusBadgeProps {
  status: SecretStatus;
}

const LABEL: Record<SecretStatus, string> = {
  set: "Ustawiony",
  empty: "Pusty — ustaw wartość",
  checking: "Sprawdzam…",
};

/** Never color-only: a dot + icon + text label for the secret's Keychain
 *  status. Values are never involved — this reflects secret_exists only. */
export function SecretStatusBadge({ status }: SecretStatusBadgeProps) {
  return (
    <span
      className={`secret-badge ${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden />
      {status === "set" && <Icon name="i-lock" size={13} />}
      {status === "empty" && <Icon name="i-unlock" size={13} />}
      {LABEL[status]}
    </span>
  );
}
