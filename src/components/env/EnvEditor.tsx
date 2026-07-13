import type { Environment, KeyValue } from "../../lib/types";
import { secretDelete } from "../../lib/ipc";
import { EnvMeta } from "./EnvMeta";
import { EnvVariablesTable } from "./EnvVariablesTable";
import { SecretNamesList } from "./SecretNamesList";
import { useT } from "../../i18n/useT";

interface EnvEditorProps {
  environment: Environment;
  environments: Environment[];
  onPatch: (partial: Partial<Environment>) => void;
}

/** Right column: edit one environment's meta, public variables, and secret
 *  names. Every change dispatches a debounced patch through the manager. */
export function EnvEditor({
  environment,
  environments,
  onPatch,
}: EnvEditorProps) {
  const t = useT();
  const baseEnvironments = environments.filter((e) => e.parent_id === null);

  function setVariables(variables: KeyValue[]) {
    onPatch({ variables });
  }

  function setSecretNames(secret_names: string[]) {
    onPatch({ secret_names });
  }

  return (
    <div className="env-editor lok-scroll">
      <EnvMeta
        environment={environment}
        baseEnvironments={baseEnvironments}
        onPatch={onPatch}
      />

      <div>
        <p className="env-section-title" style={{ marginBottom: 6 }}>
          {t("env.publicVariables")}
        </p>
        <EnvVariablesTable
          variables={environment.variables}
          onChange={setVariables}
        />
      </div>

      <div>
        <p className="env-section-title" style={{ marginBottom: 6 }}>
          {t("env.secretsSection")}
        </p>
        <SecretNamesList
          names={environment.secret_names}
          onNamesChange={setSecretNames}
          onPurge={(name) => secretDelete(name).catch(() => undefined)}
        />
      </div>
    </div>
  );
}
