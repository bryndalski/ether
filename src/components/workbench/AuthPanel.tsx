import type { Auth } from "../../lib/types";
import { defaultAuth, type AuthType } from "../../lib/auth";
import { AuthTypeSelect } from "./AuthTypeSelect";
import { AuthForm } from "./AuthForm";
import { useT } from "../../i18n/useT";

interface AuthPanelProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

/** Auth type select + the variant-specific field form. */
export function AuthPanel({ auth, onChange }: AuthPanelProps) {
  const t = useT();
  function changeType(type: AuthType) {
    onChange(defaultAuth(type));
  }

  return (
    <div className="pane" role="tabpanel" aria-label={t("workbench.authPane")}>
      <div className="pane-inner">
        <AuthTypeSelect type={auth.type} onChange={changeType} />
        <AuthForm auth={auth} onChange={onChange} />
      </div>
    </div>
  );
}
