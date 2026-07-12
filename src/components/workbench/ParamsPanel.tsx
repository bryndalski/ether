import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "./KeyValueTable";

interface ParamsPanelProps {
  params: KeyValue[];
  onChange: (params: KeyValue[]) => void;
}

/** Query params grid. Params↔URL sync lives in useRequestDraft; this only
 *  passes rows through to the shared KeyValueTable. */
export function ParamsPanel({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="pane" role="tabpanel" aria-label="Parametry">
      <div className="pane-inner">
        <KeyValueTable
          rows={params}
          onChange={onChange}
          keyHeader="Param"
          valueHeader="Value"
          keyPlaceholder="Param"
        />
      </div>
    </div>
  );
}
