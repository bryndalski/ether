import type { KeyValue } from "../../lib/types";

interface ResponseHeadersProps {
  headers: KeyValue[];
}

/** Read-only two-column mono list of response headers. */
export function ResponseHeaders({ headers }: ResponseHeadersProps) {
  if (headers.length === 0) {
    return <p className="wb-label">Brak nagłówków w odpowiedzi.</p>;
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
