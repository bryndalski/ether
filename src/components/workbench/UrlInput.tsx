import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import { SingleLineCodeInput } from "../common/SingleLineCodeInput";

interface UrlInputProps {
  url: string;
  onChange: (url: string) => void;
  onEnter: () => void;
}

/** Monospace URL field. Enter submits (sends the request). A single-line
 *  CodeMirror carries the shared `{{...}}` autocomplete + token-pill highlight,
 *  so URL variables are suggested and colored exactly like everywhere else. */
export function UrlInput({ url, onChange, onEnter }: UrlInputProps) {
  const t = useT();
  const getCandidates = useVariableCandidates();
  return (
    <SingleLineCodeInput
      className="url-field"
      value={url}
      onChange={onChange}
      onEnter={onEnter}
      getCandidates={getCandidates}
      ariaLabel={t("workbench.urlAria")}
      placeholder="https://api.example.com/{{env.host}}/users"
      fontSize="var(--lok-fs-md)"
    />
  );
}
