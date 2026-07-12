import { useState } from "react";
import { JwtClaimsView } from "./JwtClaimsView";

/** Standalone paste-decode surface (drawer). The token lives ONLY in local
 *  component state — no persistence, no IPC, no logging. autoComplete/spellCheck
 *  off so the OS never captures it. */
export function JwtPasteDecoder() {
  const [token, setToken] = useState("");
  const trimmed = token.trim();

  return (
    <div className="dv-paste">
      <label className="dv-field">
        <span className="dv-field-label">Wklej token JWT</span>
        <textarea
          className="dv-textarea"
          aria-label="Wklej token JWT"
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
            Wyczyść
          </button>
          <JwtClaimsView token={trimmed} />
        </>
      )}
    </div>
  );
}
