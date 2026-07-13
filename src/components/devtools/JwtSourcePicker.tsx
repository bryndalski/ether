import type { JwtCandidate } from "../../lib/jwt";
import { useT } from "../../i18n/useT";

interface JwtSourcePickerProps {
  candidates: JwtCandidate[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/** Select of detected token sources (Authorization / Cookie / body.path). */
export function JwtSourcePicker({
  candidates,
  selectedIndex,
  onSelect,
}: JwtSourcePickerProps) {
  const t = useT();
  if (candidates.length <= 1) return null;
  return (
    <label className="dv-field dv-field-inline">
      <span className="dv-field-label">{t("devtools.tokenSource")}</span>
      <select
        className="dv-select"
        value={selectedIndex}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {candidates.map((candidate, index) => (
          <option key={candidate.token + index} value={index}>
            {candidate.label}
          </option>
        ))}
      </select>
    </label>
  );
}
