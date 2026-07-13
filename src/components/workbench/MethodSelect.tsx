import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface MethodSelectProps {
  method: string;
  onChange: (method: string) => void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Method dropdown, colored by verb. A native <select> is overlaid transparently
 *  for keyboard + a11y while the visible chip shows the colored method label. */
export function MethodSelect({ method, onChange }: MethodSelectProps) {
  const upper = method.toUpperCase();
  const methodClass = `method ${upper.toLowerCase()}`;
  const t = useT();
  return (
    <div className="method-select">
      <span className={methodClass}>{upper}</span>
      <Icon name="i-chev" size={13} />
      <select
        aria-label={t("workbench.methodAria")}
        value={upper}
        onChange={(event) => onChange(event.target.value)}
      >
        {METHODS.map((verb) => (
          <option key={verb} value={verb}>
            {verb}
          </option>
        ))}
      </select>
    </div>
  );
}
