import type { Auth } from "../../lib/types";
import { AuthField } from "./AuthField";

interface AuthFormProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

const SECRET_HINT = "{{secret.NAME}}";

/** Render the fields for the selected Auth variant. Secret-bearing fields hint
 *  at {{secret.NAME}}; the FE stores templates only. */
export function AuthForm({ auth, onChange }: AuthFormProps) {
  switch (auth.type) {
    case "none":
      return <p className="wb-label">Request wysyłany bez autoryzacji.</p>;
    case "bearer":
      return (
        <AuthField
          label="Token"
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
            label="Użytkownik"
            value={auth.username}
            onChange={(username) => onChange({ ...auth, username })}
          />
          <AuthField
            label="Hasło"
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
            label="Nazwa"
            value={auth.name}
            onChange={(name) => onChange({ ...auth, name })}
          />
          <AuthField
            label="Wartość"
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
              Umiejscowienie
            </span>
            <select
              aria-label="Umiejscowienie klucza API"
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
            label="Profil"
            value={auth.profile}
            onChange={(profile) => onChange({ ...auth, profile })}
          />
          <AuthField
            label="Region"
            value={auth.region}
            onChange={(region) => onChange({ ...auth, region })}
          />
          <AuthField
            label="Usługa"
            value={auth.service}
            onChange={(service) => onChange({ ...auth, service })}
          />
        </>
      );
  }
}
