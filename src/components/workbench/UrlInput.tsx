import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import { SingleLineCodeInput } from "../common/SingleLineCodeInput";

interface UrlInputProps {
  url: string;
  onChange: (url: string) => void;
  onEnter: () => void;
  /** Context-specific hint; defaults to the REST example. */
  placeholder?: string;
}

/** Monospace URL field — a SINGLE flat line (Postman-style). It never wraps or
 *  grows in height, so it can't overlap the tabs below; a long URL scrolls
 *  horizontally with an edge fade, and the full value is shown as a hover
 *  tooltip. A single-line CodeMirror carries the shared `{{...}}` autocomplete +
 *  token-pill highlight and host/path/query coloring. */
export function UrlInput({
  url,
  onChange,
  onEnter,
  placeholder = "https://api.example.com/{{env.host}}/users",
}: UrlInputProps) {
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
      placeholder={placeholder}
      fontSize="var(--lok-fs-md)"
      highlightUrl
      wrap={false}
    />
  );
}
