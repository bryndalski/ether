import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "../workbench/KeyValueTable";

interface VariablesTableProps {
  variables: KeyValue[];
  onChange: (variables: KeyValue[]) => void;
}

/** Public (commit-safe) environment variables, edited through the shared
 *  workbench KeyValueTable. These are plain text and shown fully — secrets live
 *  in SecretNamesList and never appear here. */
export function VariablesTable({ variables, onChange }: VariablesTableProps) {
  return (
    <KeyValueTable
      rows={variables}
      onChange={onChange}
      keyHeader="Zmienna"
      valueHeader="Wartość"
      keyPlaceholder="nazwa"
      valuePlaceholder="wartość"
    />
  );
}
