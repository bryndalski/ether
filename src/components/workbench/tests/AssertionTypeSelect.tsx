import type { AssertionType } from "../../../lib/types";

interface AssertionTypeSelectProps {
  value: AssertionType;
  onChange: (type: AssertionType) => void;
  index: number;
}

/** The fixed menu of the 9 scriptless assertion types. */
const TYPE_LABELS: Record<AssertionType, string> = {
  status_equals: "Status =",
  status_in_range: "Status w zakresie",
  header_exists: "Nagłówek istnieje",
  header_equals: "Nagłówek =",
  json_path_exists: "JSONPath istnieje",
  json_path_equals: "JSONPath =",
  json_path_type: "JSONPath typ",
  body_contains: "Body zawiera",
  response_time_below: "Czas < ms",
};

const TYPES = Object.keys(TYPE_LABELS) as AssertionType[];

export function AssertionTypeSelect({ value, onChange, index }: AssertionTypeSelectProps) {
  return (
    <select
      className="test-type"
      value={value}
      aria-label={`Typ asercji ${index + 1}`}
      onChange={(event) => onChange(event.target.value as AssertionType)}
    >
      {TYPES.map((type) => (
        <option key={type} value={type}>
          {TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}
