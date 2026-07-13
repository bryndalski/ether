import type { Assertion, JsonType } from "../../../lib/types";
import { useT } from "../../../i18n/useT";

interface AssertionFieldsProps {
  assertion: Assertion;
  index: number;
  onChange: (assertion: Assertion) => void;
}

const JSON_TYPES: JsonType[] = ["null", "boolean", "number", "string", "array", "object"];

/** Type-driven input set for one assertion. Numeric inputs use tabular-nums;
 *  JSONPath inputs are mono. Every input carries an aria-label. */
export function AssertionFields({ assertion, index, onChange }: AssertionFieldsProps) {
  const t = useT();
  const num = (label: string, value: number, patch: (v: number) => Assertion) => (
    <input
      type="number"
      className="test-field lok-tnums"
      value={value}
      aria-label={`${label} ${index + 1}`}
      onChange={(event) => onChange(patch(Number(event.target.value)))}
    />
  );
  const text = (
    label: string,
    value: string,
    patch: (v: string) => Assertion,
    mono = false,
  ) => (
    <input
      type="text"
      className={mono ? "test-field mono" : "test-field"}
      value={value}
      aria-label={`${label} ${index + 1}`}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => onChange(patch(event.target.value))}
    />
  );

  switch (assertion.type) {
    case "status_equals":
      return num(t("tests.expectedStatus"), assertion.expected, (v) => ({ ...assertion, expected: v }));
    case "status_in_range":
      return (
        <>
          {num(t("tests.minStatus"), assertion.min, (v) => ({ ...assertion, min: v }))}
          {num(t("tests.maxStatus"), assertion.max, (v) => ({ ...assertion, max: v }))}
        </>
      );
    case "header_exists":
      return text(t("tests.headerName"), assertion.name, (v) => ({ ...assertion, name: v }));
    case "header_equals":
      return (
        <>
          {text(t("tests.headerName"), assertion.name, (v) => ({ ...assertion, name: v }))}
          {text(t("tests.expectedValue"), assertion.expected, (v) => ({ ...assertion, expected: v }))}
        </>
      );
    case "json_path_exists":
      return text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true);
    case "json_path_equals":
      return (
        <>
          {text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true)}
          {text(t("tests.expectedValue"), assertion.expected, (v) => ({ ...assertion, expected: v }))}
        </>
      );
    case "json_path_type":
      return (
        <>
          {text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true)}
          <select
            className="test-field"
            value={assertion.expected_type}
            aria-label={`${t("tests.expectedType")} ${index + 1}`}
            onChange={(event) =>
              onChange({ ...assertion, expected_type: event.target.value as JsonType })
            }
          >
            {JSON_TYPES.map((jsonType) => (
              <option key={jsonType} value={jsonType}>
                {jsonType}
              </option>
            ))}
          </select>
        </>
      );
    case "body_contains":
      return text(t("tests.searchText"), assertion.substring, (v) => ({ ...assertion, substring: v }));
    case "response_time_below":
      return num(t("tests.maxMs"), assertion.max_ms, (v) => ({ ...assertion, max_ms: v }));
  }
}
