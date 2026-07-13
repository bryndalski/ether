import type { KeyValue } from "../../lib/types";
import { useT } from "../../i18n/useT";

interface ResponseHeadersProps {
  headers: KeyValue[];
}

/** Read-only two-column mono list of response headers. */
export function ResponseHeaders({ headers }: ResponseHeadersProps) {
  const t = useT();
  if (headers.length === 0) {
    return <p className="wb-label">{t("response.noHeaders")}</p>;
  }
  return (
    <div className="lok-selectable">
      {headers.map((header, index) => (
        <div className="kv-ro" key={`${header.name}-${index}`}>
          <span className="k">{header.name}</span>
          <span className="v">{header.value}</span>
        </div>
      ))}
    </div>
  );
}
