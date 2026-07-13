import type { Auth } from "../../lib/types";
import { AuthField } from "./AuthField";
import { useT } from "../../i18n/useT";

interface AuthFormProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

const SECRET_HINT = "{{secret.NAME}}";

/** Render the fields for the selected Auth variant. Secret-bearing fields hint
 *  at {{secret.NAME}}; the FE stores templates only. */
export function AuthForm({ auth, onChange }: AuthFormProps) {
  const t = useT();
  switch (auth.type) {
    case "none":
      return <p className="wb-label">{t("auth.noAuth")}</p>;
    case "bearer":
      return (
        <AuthField
          label={t("auth.token")}
          value={auth.token}
          secret
          hint={SECRET_HINT}
          onChange={(token) => onChange({ ...auth, token })}
        />
      );
    case "basic":
      return (
        <>
          <AuthField
            label={t("auth.username")}
            value={auth.username}
            onChange={(username) => onChange({ ...auth, username })}
          />
          <AuthField
            label={t("auth.password")}
            value={auth.password}
            secret
            hint={SECRET_HINT}
            onChange={(password) => onChange({ ...auth, password })}
          />
        </>
      );
    case "api_key":
      return (
        <>
          <AuthField
            label={t("auth.name")}
            value={auth.name}
            onChange={(name) => onChange({ ...auth, name })}
          />
          <AuthField
            label={t("auth.value")}
            value={auth.value}
            secret
            hint={SECRET_HINT}
            onChange={(value) => onChange({ ...auth, value })}
          />
          <label
            className="kv"
            style={{ gridTemplateColumns: "120px 1fr auto" }}
          >
            <span className="wb-label" style={{ alignSelf: "center" }}>
              {t("auth.placement")}
            </span>
            <select
              aria-label={t("auth.placementAria")}
              value={auth.placement}
              onChange={(event) =>
                onChange({
                  ...auth,
                  placement: event.target.value as "header" | "query",
                })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
            <span />
          </label>
        </>
      );
    case "sig_v4":
      return (
        <>
          <AuthField
            label={t("auth.profile")}
            value={auth.profile}
            onChange={(profile) => onChange({ ...auth, profile })}
          />
          <AuthField
            label={t("auth.region")}
            value={auth.region}
            onChange={(region) => onChange({ ...auth, region })}
          />
          <AuthField
            label={t("auth.service")}
            value={auth.service}
            onChange={(service) => onChange({ ...auth, service })}
          />
        </>
      );
  }
}
