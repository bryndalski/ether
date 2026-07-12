import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "./KeyValueTable";

interface HeadersPanelProps {
  headers: KeyValue[];
  onChange: (headers: KeyValue[]) => void;
}

/** Request headers grid (header column tinted via .kv input.k). */
export function HeadersPanel({ headers, onChange }: HeadersPanelProps) {
  return (
    <div className="pane" role="tabpanel" aria-label="Nagłówki">
      <div className="pane-inner">
        <KeyValueTable
          rows={headers}
          onChange={onChange}
          keyHeader="Header"
          valueHeader="Value"
          keyPlaceholder="Header"
        />
      </div>
    </div>
  );
}
