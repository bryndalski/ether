import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "../workbench/KeyValueTable";
import { useT } from "../../i18n/useT";

interface HeadersPanelProps {
  headers: KeyValue[];
  onChange: (headers: KeyValue[]) => void;
}

/** GraphQL headers = the SAME headers introspection and Run both send, edited in
 *  one place. Reuses the workbench KeyValueTable so an Authorization/X-Api-Key
 *  header configured here powers both the schema fetch and the operation. */
export function HeadersPanel({ headers, onChange }: HeadersPanelProps) {
  const t = useT();
  return (
    <div
      className="vars-body lok-scroll"
      role="tabpanel"
      aria-label={t("graphql.operationHeaders")}
    >
      <KeyValueTable
        rows={headers}
        onChange={onChange}
        keyHeader="Header"
        valueHeader="Value"
        keyPlaceholder="Header"
      />
    </div>
  );
}
