import type { JwtCandidate } from "../../lib/jwt";

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
  if (candidates.length <= 1) return null;
  return (
    <label className="dv-field dv-field-inline">
      <span className="dv-field-label">Źródło tokenu</span>
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
