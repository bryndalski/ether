// Factory for a default assertion of each type + a short human label. Pure so
// the Tests UI stays dumb (view only maps fields → inputs). Separate from
// assertions.ts (evaluation) to keep each file single-responsibility.

import type { Assertion, AssertionType } from "./types";
import { translate, type TKey } from "../i18n";
import { currentLocale } from "../i18n/useT";
import type { InterpolationVars } from "../i18n/interpolate";

const m = (key: TKey, vars?: InterpolationVars): string =>
  translate(currentLocale(), key, vars);

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
      return m("assertions.labelStatusEqual", { expected: assertion.expected });
    case "status_in_range":
      return m("assertions.labelStatusInRange", { min: assertion.min, max: assertion.max });
    case "header_exists":
      return m("assertions.labelHeaderExists", { name: assertion.name || "?" });
    case "header_equals":
      return m("assertions.labelHeaderEqual", { name: assertion.name || "?", expected: assertion.expected });
    case "json_path_exists":
      return m("assertions.labelPathExists", { path: assertion.path });
    case "json_path_equals":
      return m("assertions.labelPathEqual", { path: assertion.path, expected: assertion.expected });
    case "json_path_type":
      return m("assertions.labelPathType", { path: assertion.path, type: assertion.expected_type });
    case "body_contains":
      return m("assertions.labelBodyContains", { substring: assertion.substring });
    case "response_time_below":
      return m("assertions.labelTimeBelow", { max: assertion.max_ms });
  }
}
