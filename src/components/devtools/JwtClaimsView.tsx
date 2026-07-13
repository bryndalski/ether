import { decodeJwt, jwtExpiryStatus, type ExpiryStatus } from "../../lib/jwt";
import { Icon } from "../common/Icon";
import type { IconName } from "../common/Icon";
import { JwtCountdown } from "./JwtCountdown";
import { useT } from "../../i18n/useT";
import type { TKey } from "../../i18n";

interface JwtClaimsViewProps {
  token: string;
}

const REGISTERED_ORDER = ["iss", "sub", "aud", "iat", "nbf", "exp", "jti"];

const STATUS_META: Record<
  ExpiryStatus,
  { token: string; icon: IconName; labelKey: TKey }
> = {
  valid: { token: "var(--lok-status-success)", icon: "i-check", labelKey: "devtools.jwtValid" },
  "expiring-soon": {
    token: "var(--lok-status-warn)",
    icon: "i-alert",
    labelKey: "devtools.jwtExpiringSoon",
  },
  expired: { token: "var(--lok-status-danger)", icon: "i-x", labelKey: "devtools.jwtExpired" },
  "not-yet-valid": {
    token: "var(--lok-status-info)",
    icon: "i-clock",
    labelKey: "devtools.jwtNotYetValid",
  },
  "no-exp": {
    token: "var(--lok-status-neutral)",
    icon: "i-unlock",
    labelKey: "devtools.noExp",
  },
};

function renderValue(value: unknown): string {
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

/** Decoded claims + live countdown + status. The always-visible "podpis
 *  niezweryfikowany" banner never lets a user mistake this for a validator.
 *  SECURITY: the token itself is NEVER copied/logged — only the decoded JSON. */
export function JwtClaimsView({ token }: JwtClaimsViewProps) {
  const t = useT();
  const decoded = decodeJwt(token);

  if (!decoded.valid || decoded.payload == null) {
    return (
      <div className="dv-jwt">
        <p className="dv-note dv-note-danger">
          {t("devtools.decodeFailed", {
            error: decoded.error ?? t("common.unknownError"),
          })}
        </p>
      </div>
    );
  }

  const { status } = jwtExpiryStatus(decoded.payload, Date.now());
  const meta = STATUS_META[status];
  const payload = decoded.payload;
  const registered = REGISTERED_ORDER.filter((key) => key in payload);
  const others = Object.keys(payload).filter(
    (key) => !REGISTERED_ORDER.includes(key),
  );

  // Copies DECODED JSON (header+payload), NEVER the raw token.
  function copyDecoded() {
    const json = JSON.stringify(
      { header: decoded.header, payload: decoded.payload },
      null,
      2,
    );
    void navigator.clipboard?.writeText(json);
  }

  return (
    <div className="dv-jwt">
      <div className="dv-jwt-banner" role="note">
        <Icon name="i-unlock" size={14} />
        <span>{t("devtools.jwtSignatureUnverified")}</span>
      </div>

      <div className="dv-jwt-statusrow">
        <span className="dv-badge" style={{ color: meta.token }}>
          <Icon name={meta.icon} size={14} />
          {t(meta.labelKey)}
        </span>
        <JwtCountdown payload={decoded.payload} />
        <button
          type="button"
          className="dv-btn dv-btn-ghost"
          aria-label={t("devtools.copyDecodedJson")}
          title={t("devtools.copyDecodedJsonTitle")}
          onClick={copyDecoded}
        >
          <Icon name="i-copy" size={13} />
        </button>
      </div>

      <dl className="dv-kv">
        {registered.map((key) => (
          <div className="dv-kv-row" key={key}>
            <dt className="dv-kv-key">{key}</dt>
            <dd className="dv-kv-val lok-selectable lok-tnums">
              {renderValue(payload[key])}
            </dd>
          </div>
        ))}
      </dl>

      {others.length > 0 && (
        <dl className="dv-kv dv-kv-muted">
          {others.map((key) => (
            <div className="dv-kv-row" key={key}>
              <dt className="dv-kv-key">{key}</dt>
              <dd className="dv-kv-val lok-selectable">
                {renderValue(payload[key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
