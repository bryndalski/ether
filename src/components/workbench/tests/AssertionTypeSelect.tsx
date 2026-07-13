import type { AssertionType } from "../../../lib/types";
import { useT, type TranslateFn } from "../../../i18n/useT";
import type { TKey } from "../../../i18n";

interface AssertionTypeSelectProps {
  value: AssertionType;
  onChange: (type: AssertionType) => void;
  index: number;
}

/** The fixed menu of the 9 scriptless assertion types, keyed to i18n. */
const TYPE_KEYS: Record<AssertionType, TKey> = {
  status_equals: "tests.typeStatusEquals",
  status_in_range: "tests.typeStatusInRange",
  header_exists: "tests.typeHeaderExists",
  header_equals: "tests.typeHeaderEquals",
  json_path_exists: "tests.typeJsonPathExists",
  json_path_equals: "tests.typeJsonPathEquals",
  json_path_type: "tests.typeJsonPathType",
  body_contains: "tests.typeBodyContains",
  response_time_below: "tests.typeResponseTimeBelow",
};

const TYPES = Object.keys(TYPE_KEYS) as AssertionType[];

const typeLabel = (t: TranslateFn, type: AssertionType): string =>
  t(TYPE_KEYS[type]);

export function AssertionTypeSelect({ value, onChange, index }: AssertionTypeSelectProps) {
  const t = useT();
  return (
    <select
      className="test-type"
      value={value}
      aria-label={t("tests.assertionType", { index: index + 1 })}
      onChange={(event) => onChange(event.target.value as AssertionType)}
    >
      {TYPES.map((type) => (
        <option key={type} value={type}>
          {typeLabel(t, type)}
        </option>
      ))}
    </select>
  );
}
