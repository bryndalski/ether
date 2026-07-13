import type { Assertion, JsonType } from "../../../lib/types";

interface AssertionFieldsProps {
  assertion: Assertion;
  index: number;
  onChange: (assertion: Assertion) => void;
}

const JSON_TYPES: JsonType[] = ["null", "boolean", "number", "string", "array", "object"];

/** Type-driven input set for one assertion. Numeric inputs use tabular-nums;
 *  JSONPath inputs are mono. Every input carries an aria-label. */
export function AssertionFields({ assertion, index, onChange }: AssertionFieldsProps) {
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
      return num("Oczekiwany status", assertion.expected, (v) => ({ ...assertion, expected: v }));
    case "status_in_range":
      return (
        <>
          {num("Min status", assertion.min, (v) => ({ ...assertion, min: v }))}
          {num("Max status", assertion.max, (v) => ({ ...assertion, max: v }))}
        </>
      );
    case "header_exists":
      return text("Nazwa nagłówka", assertion.name, (v) => ({ ...assertion, name: v }));
    case "header_equals":
      return (
        <>
          {text("Nazwa nagłówka", assertion.name, (v) => ({ ...assertion, name: v }))}
          {text("Oczekiwana wartość", assertion.expected, (v) => ({ ...assertion, expected: v }))}
        </>
      );
    case "json_path_exists":
      return text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true);
    case "json_path_equals":
      return (
        <>
          {text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true)}
          {text("Oczekiwana wartość", assertion.expected, (v) => ({ ...assertion, expected: v }))}
        </>
      );
    case "json_path_type":
      return (
        <>
          {text("JSONPath", assertion.path, (v) => ({ ...assertion, path: v }), true)}
          <select
            className="test-field"
            value={assertion.expected_type}
            aria-label={`Oczekiwany typ ${index + 1}`}
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
      return text("Szukany tekst", assertion.substring, (v) => ({ ...assertion, substring: v }));
    case "response_time_below":
      return num("Maks. ms", assertion.max_ms, (v) => ({ ...assertion, max_ms: v }));
  }
}
