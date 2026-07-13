import type { SecretStatus } from "../../hooks/useSecrets";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";
import type { TKey } from "../../i18n";

interface SecretStatusBadgeProps {
  status: SecretStatus;
}

const LABEL_KEY: Record<SecretStatus, TKey> = {
  set: "secrets.statusSet",
  empty: "secrets.statusEmpty",
  checking: "secrets.statusChecking",
  saving: "secrets.statusSaving",
};

/** Never color-only: a dot + icon + text label for the secret's Keychain
 *  status. Values are never involved — this reflects secret_exists only. */
export function SecretStatusBadge({ status }: SecretStatusBadgeProps) {
  const t = useT();
  return (
    <span
      className={`secret-badge ${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden />
      {status === "set" && <Icon name="i-lock" size={13} />}
      {status === "empty" && <Icon name="i-unlock" size={13} />}
      {t(LABEL_KEY[status])}
    </span>
  );
}
