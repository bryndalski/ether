import { useEffect, useState } from "react";
import { parseCert, type ParsedCert } from "../../lib/certParse";
import { formatRelativeDuration } from "../../lib/format";
import { Icon } from "../common/Icon";

interface CertCardProps {
  pem: string;
  index: number;
}

const DAY_MS = 86_400_000;
const WARN_DAYS = 30;

function validityNote(notAfter: string | null): {
  text: string;
  token: string;
} | null {
  if (!notAfter) return null;
  const remainingMs = Date.parse(notAfter) - Date.now();
  if (Number.isNaN(remainingMs)) return null;
  if (remainingMs <= 0) {
    return {
      text: `wygasł ${formatRelativeDuration(remainingMs)} temu`,
      token: "var(--lok-status-danger)",
    };
  }
  const token =
    remainingMs < WARN_DAYS * DAY_MS
      ? "var(--lok-status-warn)"
      : "var(--lok-status-success)";
  return { text: `ważny jeszcze ${formatRelativeDuration(remainingMs)}`, token };
}

/** One parsed cert per PEM. Best-effort fields + always-present fingerprint,
 *  a validity note (danger/warn/ok), SAN chips, serial, and a raw-PEM toggle.
 *  parseComplete=false → a neutral "partially parsed" note; never crashes. */
export function CertCard({ pem, index }: CertCardProps) {
  const [cert, setCert] = useState<ParsedCert | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let active = true;
    void parseCert(pem).then((parsed) => {
      if (active) setCert(parsed);
    });
    return () => {
      active = false;
    };
  }, [pem]);

  if (!cert) return <div className="dv-cert-card dv-note">Parsuję certyfikat…</div>;

  const validity = validityNote(cert.notAfter);

  return (
    <div className="dv-cert-card">
      <div className="dv-cert-title">
        <Icon name="i-shield" size={14} />
        <span>{cert.subjectCn ?? `Certyfikat #${index + 1}`}</span>
      </div>

      <dl className="dv-kv">
        <div className="dv-kv-row">
          <dt className="dv-kv-key">Wystawca</dt>
          <dd className="dv-kv-val lok-selectable">{cert.issuerCn ?? "—"}</dd>
        </div>
        <div className="dv-kv-row">
          <dt className="dv-kv-key">Ważność</dt>
          <dd className="dv-kv-val lok-tnums">
            {cert.notBefore ?? "—"} → {cert.notAfter ?? "—"}
            {validity && (
              <span className="dv-cert-validity" style={{ color: validity.token }}>
                {" · "}
                {validity.text}
              </span>
            )}
          </dd>
        </div>
        <div className="dv-kv-row">
          <dt className="dv-kv-key">Serial</dt>
          <dd className="dv-kv-val lok-selectable lok-tnums">
            {cert.serialHex ?? "—"}
          </dd>
        </div>
        <div className="dv-kv-row">
          <dt className="dv-kv-key">SHA-256</dt>
          <dd className="dv-kv-val lok-selectable lok-tnums dv-fingerprint">
            {cert.fingerprintSha256}
            <button
              type="button"
              className="dv-btn dv-btn-ghost"
              aria-label="Kopiuj fingerprint"
              onClick={() =>
                void navigator.clipboard?.writeText(cert.fingerprintSha256)
              }
            >
              <Icon name="i-copy" size={12} />
            </button>
          </dd>
        </div>
      </dl>

      {cert.sans.length > 0 && (
        <div className="dv-san-chips">
          {cert.sans.map((san) => (
            <span className="dv-chip" key={san}>
              {san}
            </span>
          ))}
        </div>
      )}

      {!cert.parseComplete && (
        <p className="dv-note">
          Częściowo sparsowany — pokazuję fingerprint i surowy PEM.
        </p>
      )}

      <button
        type="button"
        className="dv-btn dv-btn-ghost"
        aria-expanded={showRaw}
        onClick={() => setShowRaw((prev) => !prev)}
      >
        {showRaw ? "Ukryj surowy PEM" : "Pokaż surowy PEM"}
      </button>
      {showRaw && <pre className="dv-raw-pem lok-selectable">{cert.raw}</pre>}
    </div>
  );
}
