import type { KeyValue } from "../../lib/types";
import { KeyValueTable } from "../workbench/KeyValueTable";
import { useT } from "../../i18n/useT";

interface VariablesTableProps {
  variables: KeyValue[];
  onChange: (variables: KeyValue[]) => void;
}

/** Public (commit-safe) environment variables, edited through the shared
 *  workbench KeyValueTable. These are plain text and shown fully — secrets live
 *  in SecretNamesList and never appear here. */
export function VariablesTable({ variables, onChange }: VariablesTableProps) {
  const t = useT();
  return (
    <KeyValueTable
      rows={variables}
      onChange={onChange}
      keyHeader={t("env.variableHeader")}
      valueHeader={t("env.valueHeader")}
      keyPlaceholder={t("env.variableNamePlaceholder")}
      valuePlaceholder={t("env.valuePlaceholder")}
    />
  );
}
