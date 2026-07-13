import { useState } from "react";
import { useT } from "../../i18n/useT";

interface AuthFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  hint?: string;
}

/** A single labelled mono auth input. Secret fields get a show/hide toggle and
 *  a {{secret.NAME}} hint — the FE only stores the template, never a resolved
 *  secret value. */
export function AuthField({
  label,
  value,
  onChange,
  secret = false,
  hint,
}: AuthFieldProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const type = secret && !revealed ? "password" : "text";
  return (
    <label
      className="kv"
      style={{ gridTemplateColumns: "120px 1fr auto", marginBottom: 4 }}
    >
      <span className="wb-label" style={{ alignSelf: "center" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={hint}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {secret ? (
        <button
          type="button"
          aria-label={
            revealed
              ? t("auth.hideField", { label })
              : t("auth.revealField", { label })
          }
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--lok-text-tertiary)",
            fontSize: "var(--lok-fs-2xs)",
            cursor: "pointer",
            padding: "0 6px",
          }}
        >
          {revealed ? t("auth.hide") : t("auth.reveal")}
        </button>
      ) : (
        <span />
      )}
    </label>
  );
}
