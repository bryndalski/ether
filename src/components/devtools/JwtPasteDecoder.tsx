import { useState } from "react";
import { JwtClaimsView } from "./JwtClaimsView";
import { useT } from "../../i18n/useT";

/** Standalone paste-decode surface (drawer). The token lives ONLY in local
 *  component state — no persistence, no IPC, no logging. autoComplete/spellCheck
 *  off so the OS never captures it. */
export function JwtPasteDecoder() {
  const t = useT();
  const [token, setToken] = useState("");
  const trimmed = token.trim();

  return (
    <div className="dv-paste">
      <label className="dv-field">
        <span className="dv-field-label">{t("devtools.pasteJwt")}</span>
        <textarea
          className="dv-textarea"
          aria-label={t("devtools.pasteJwt")}
          autoComplete="off"
          spellCheck={false}
          rows={4}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="eyJ..."
        />
      </label>
      {trimmed !== "" && (
        <>
          <button
            type="button"
            className="dv-btn dv-btn-ghost"
            onClick={() => setToken("")}
          >
            {t("devtools.clear")}
          </button>
          <JwtClaimsView token={trimmed} />
        </>
      )}
    </div>
  );
}
