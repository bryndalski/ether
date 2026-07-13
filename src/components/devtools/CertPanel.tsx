import type { TlsInfo } from "../../lib/types";
import { TlsSummary } from "./TlsSummary";
import { CertCard } from "./CertCard";
import { useT } from "../../i18n/useT";

interface CertPanelProps {
  tls: TlsInfo;
  insecure: boolean;
}

/** The `Cert` dock tab — TLS summary badges + a card per PEM in the chain. */
export function CertPanel({ tls, insecure }: CertPanelProps) {
  const t = useT();
  return (
    <div className="dv-panel">
      <TlsSummary tls={tls} insecure={insecure} />
      {tls.cert_chain.length === 0 ? (
        <p className="dv-note">{t("devtools.noCertsInChain")}</p>
      ) : (
        tls.cert_chain.map((pem, index) => (
          <CertCard key={index} pem={pem} index={index} />
        ))
      )}
    </div>
  );
}
