// Factory for a default assertion of each type + a short human label. Pure so
// the Tests UI stays dumb (view only maps fields → inputs). Separate from
// assertions.ts (evaluation) to keep each file single-responsibility.

import type { Assertion, AssertionType } from "./types";

/** A sensible blank assertion for a freshly-added or type-switched row. */
export function defaultAssertion(type: AssertionType): Assertion {
  switch (type) {
    case "status_equals":
      return { type, expected: 200, enabled: true };
    case "status_in_range":
      return { type, min: 200, max: 299, enabled: true };
    case "header_exists":
      return { type, name: "", enabled: true };
    case "header_equals":
      return { type, name: "", expected: "", enabled: true };
    case "json_path_exists":
      return { type, path: "$.", enabled: true };
    case "json_path_equals":
      return { type, path: "$.", expected: "", enabled: true };
    case "json_path_type":
      return { type, path: "$.", expected_type: "string", enabled: true };
    case "body_contains":
      return { type, substring: "", enabled: true };
    case "response_time_below":
      return { type, max_ms: 1000, enabled: true };
  }
}

/** A one-line human summary of an assertion for the results/label rows. */
export function assertionLabel(assertion: Assertion): string {
  switch (assertion.type) {
    case "status_equals":
      return `status = ${assertion.expected}`;
    case "status_in_range":
      return `status w [${assertion.min}, ${assertion.max}]`;
    case "header_exists":
      return `nagłówek ${assertion.name || "?"} istnieje`;
    case "header_equals":
      return `${assertion.name || "?"} = ${assertion.expected}`;
    case "json_path_exists":
      return `${assertion.path} istnieje`;
    case "json_path_equals":
      return `${assertion.path} = ${assertion.expected}`;
    case "json_path_type":
      return `${assertion.path} : ${assertion.expected_type}`;
    case "body_contains":
      return `body zawiera "${assertion.substring}"`;
    case "response_time_below":
      return `czas < ${assertion.max_ms} ms`;
  }
}
