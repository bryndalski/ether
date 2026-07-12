import type { Auth } from "../../lib/types";
import { defaultAuth, type AuthType } from "../../lib/auth";
import { AuthTypeSelect } from "./AuthTypeSelect";
import { AuthForm } from "./AuthForm";

interface AuthPanelProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

/** Auth type select + the variant-specific field form. */
export function AuthPanel({ auth, onChange }: AuthPanelProps) {
  function changeType(type: AuthType) {
    onChange(defaultAuth(type));
  }

  return (
    <div className="pane" role="tabpanel" aria-label="Autoryzacja">
      <div className="pane-inner">
        <AuthTypeSelect type={auth.type} onChange={changeType} />
        <AuthForm auth={auth} onChange={onChange} />
      </div>
    </div>
  );
}
