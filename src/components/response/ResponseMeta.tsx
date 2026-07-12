import type { Timings, TlsInfo } from "../../lib/types";
import { formatMs, humanBytes } from "../../lib/format";

interface ResponseMetaProps {
  timings: Timings;
  sizeBytes: number;
  tls: TlsInfo | null;
}

/** Time · Size · TLS summary (mono, tabular-nums). TLS row hidden when null. */
export function ResponseMeta({ timings, sizeBytes, tls }: ResponseMetaProps) {
  return (
    <div className="resp-meta">
      <span>
        Time <b>{formatMs(timings.total_ms)} ms</b>
      </span>
      <span>
        Size <b>{humanBytes(sizeBytes)}</b>
      </span>
      {tls?.protocol && (
        <span>
          TLS <b>{tls.protocol}</b>
        </span>
      )}
    </div>
  );
}
