import type { TlsInfo } from "../../lib/types";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface TlsSummaryProps {
  tls: TlsInfo;
  insecure: boolean;
}

/** Protocol / cipher / verify badges — each icon + text, never color-only. */
export function TlsSummary({ tls, insecure }: TlsSummaryProps) {
  const t = useT();
  return (
    <div className="dv-tls-summary">
      <span className="dv-chip lok-tnums" title={tls.protocol ?? ""}>
        {tls.protocol ?? "—"}
      </span>
      <span className="dv-chip dv-chip-cipher" title={tls.cipher ?? ""}>
        {tls.cipher ?? "—"}
      </span>
      {tls.verify_ok ? (
        <span className="dv-badge" style={{ color: "var(--lok-status-success)" }}>
          <Icon name="i-lock" size={14} />
          {t("devtools.tlsVerified")}
        </span>
      ) : (
        <span className="dv-badge" style={{ color: "var(--lok-status-danger)" }}>
          <Icon name="i-unlock" size={14} />
          {t("devtools.tlsNotVerified")}
        </span>
      )}
      {insecure && (
        <span className="dv-badge" style={{ color: "var(--lok-status-warn)" }}>
          <Icon name="i-alert" size={14} />
          {t("devtools.verifySkipped")}
        </span>
      )}
    </div>
  );
}
