import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "./KeyValueTable";
import { useT } from "../../i18n/useT";

interface HeadersPanelProps {
  headers: KeyValue[];
  onChange: (headers: KeyValue[]) => void;
}

/** Request headers grid (header column tinted via .kv input.k). */
export function HeadersPanel({ headers, onChange }: HeadersPanelProps) {
  const t = useT();
  return (
    <div className="pane" role="tabpanel" aria-label={t("workbench.headersPane")}>
      <div className="pane-inner">
        <KeyValueTable
          rows={headers}
          onChange={onChange}
          keyHeader="Header"
          valueHeader="Value"
          keyPlaceholder="Header"
          variant="headers"
        />
      </div>
    </div>
  );
}
