import type { Environment, EnvKind } from "../../lib/types";
import { envKind } from "../../state/useEnvStore";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface EnvMetaProps {
  environment: Environment;
  baseEnvironments: Environment[];
  onPatch: (partial: Partial<Environment>) => void;
}

const KINDS: EnvKind[] = ["local", "dev", "staging", "prod", "custom"];

/** Name, parent (base) select, and kind/color select for one environment.
 *  Prod selection surfaces an explicit danger warning strip. */
export function EnvMeta({
  environment,
  baseEnvironments,
  onPatch,
}: EnvMetaProps) {
  const kind = envKind(environment);
  const t = useT();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="env-field">
        <label htmlFor="env-name">{t("env.name")}</label>
        <input
          id="env-name"
          type="text"
          value={environment.name}
          spellCheck={false}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>

      <div className="env-field">
        <label htmlFor="env-parent">{t("env.baseInheritance")}</label>
        <select
          id="env-parent"
          value={environment.parent_id ?? ""}
          onChange={(event) =>
            onPatch({ parent_id: event.target.value || null })
          }
        >
          <option value="">{t("env.isBaseOption")}</option>
          {baseEnvironments
            .filter((base) => base.id !== environment.id)
            .map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
        </select>
      </div>

      <div className="env-field">
        <label htmlFor="env-kind">{t("env.kindColor")}</label>
        <select
          id="env-kind"
          value={kind}
          onChange={(event) => onPatch({ color: event.target.value })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {kind === "prod" && (
        <div className="env-prod-warn" role="note">
          <Icon name="i-shield" size={15} />
          {t("env.prodWarning")}
        </div>
      )}
    </div>
  );
}
