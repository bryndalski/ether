// Pure, scriptless assertion evaluation. Reads a ResponseData the FE already
// holds and produces one result per assertion. Total & side-effect-free: a
// malformed assertion or a non-JSON body yields a `fail` with a diagnostic
// message, never a throw. Mirrors docs/architecture/testing.md §1.3.

import type { Assertion, ResponseData } from "./types";
import { jsonType, parseJsonBody, type JsonType } from "./jsonDiff";

export type AssertionStatus = "pass" | "fail" | "skipped";

export interface AssertionResult {
  assertion: Assertion;
  index: number;
  status: AssertionStatus;
  message: string;
  actual?: string;
  expected?: string;
}

export interface AssertionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  allPassed: boolean;
}

/** A resolved JSONPath node plus whether the path actually exists in the tree
 *  (a present `null` node still "exists"). */
interface Resolved {
  found: boolean;
  value: unknown;
}

const NOT_FOUND: Resolved = { found: false, value: undefined };

/** Minimal, dependency-free dot/bracket JSONPath — the exact grammar jsonDiff
 *  emits ($, $.a, $.a.b, $.items[2], $.items[2].id). No wildcards/filters. */
export function resolveJsonPath(root: unknown, path: string): Resolved {
  const trimmed = path.trim();
  if (trimmed === "" || trimmed === "$") return { found: true, value: root };
  if (!trimmed.startsWith("$")) return NOT_FOUND;

  const tokens = trimmed.slice(1).match(/\.[^.[\]]+|\[\d+\]/g);
  if (!tokens) return NOT_FOUND;

  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || current === undefined) return NOT_FOUND;
    if (token.startsWith("[")) {
      const index = Number(token.slice(1, -1));
      if (!Array.isArray(current) || index >= current.length) return NOT_FOUND;
      current = current[index];
    } else {
      const key = token.slice(1);
      if (
        typeof current !== "object" ||
        Array.isArray(current) ||
        !Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return NOT_FOUND;
      }
      current = (current as Record<string, unknown>)[key];
    }
  }
  return { found: true, value: current };
}

/** Case-insensitive header join (multi-value → ", "), reusing headersDiff's
 *  proven semantics without duplicating them across the codebase. */
function joinHeader(headers: ResponseData["headers"], name: string): {
  present: boolean;
  value: string;
} {
  const lower = name.toLowerCase();
  const matches = headers.filter((h) => h.name.toLowerCase() === lower);
  return { present: matches.length > 0, value: matches.map((h) => h.value).join(", ") };
}

function render(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Lenient coercion for json_path_equals: if `expected` parses as JSON, compare
 *  structurally; else compare String(node) to expected. So "200"↔200, "true"↔true. */
function valueMatchesExpected(node: unknown, expected: string): boolean {
  try {
    const parsed = JSON.parse(expected);
    if (JSON.stringify(parsed) === JSON.stringify(node)) return true;
  } catch {
    // expected is a plain string — fall through to string compare.
  }
  return String(node) === expected;
}

function pass(assertion: Assertion, index: number, message: string): AssertionResult {
  return { assertion, index, status: "pass", message };
}

function fail(
  assertion: Assertion,
  index: number,
  message: string,
  expected?: string,
  actual?: string,
): AssertionResult {
  return { assertion, index, status: "fail", message, expected, actual };
}

/** True when a body cannot be pathed into (binary / non-JSON). */
function bodyIsBinary(response: ResponseData): boolean {
  return response.body_is_base64;
}

function evalOne(
  response: ResponseData,
  assertion: Assertion,
  index: number,
  json: () => { ok: boolean; value?: unknown; reason?: string },
): AssertionResult {
  switch (assertion.type) {
    case "status_equals": {
      const ok = response.status === assertion.expected;
      return ok
        ? pass(assertion, index, `status ${response.status} = ${assertion.expected}`)
        : fail(
            assertion,
            index,
            `oczekiwano ${assertion.expected}, otrzymano ${response.status}`,
            String(assertion.expected),
            String(response.status),
          );
    }
    case "status_in_range": {
      const ok =
        response.status >= assertion.min && response.status <= assertion.max;
      return ok
        ? pass(
            assertion,
            index,
            `status ${response.status} w [${assertion.min}, ${assertion.max}]`,
          )
        : fail(
            assertion,
            index,
            `status ${response.status} poza [${assertion.min}, ${assertion.max}]`,
            `${assertion.min}–${assertion.max}`,
            String(response.status),
          );
    }
    case "header_exists": {
      const { present } = joinHeader(response.headers, assertion.name);
      return present
        ? pass(assertion, index, `nagłówek ${assertion.name} istnieje`)
        : fail(assertion, index, `brak nagłówka ${assertion.name}`);
    }
    case "header_equals": {
      const { present, value } = joinHeader(response.headers, assertion.name);
      if (!present) return fail(assertion, index, `brak nagłówka ${assertion.name}`);
      const ok = value === assertion.expected;
      return ok
        ? pass(assertion, index, `${assertion.name} = ${assertion.expected}`)
        : fail(
            assertion,
            index,
            `${assertion.name}: oczekiwano "${assertion.expected}"`,
            assertion.expected,
            value,
          );
    }
    case "json_path_exists": {
      if (bodyIsBinary(response))
        return fail(assertion, index, `binarne body — nie można sprawdzić ${assertion.path}`);
      const parsed = json();
      if (!parsed.ok)
        return fail(assertion, index, `body nie jest JSON — nie można sprawdzić ${assertion.path}`);
      const { found } = resolveJsonPath(parsed.value, assertion.path);
      return found
        ? pass(assertion, index, `${assertion.path} istnieje`)
        : fail(assertion, index, `${assertion.path} nie znaleziono`);
    }
    case "json_path_equals": {
      if (bodyIsBinary(response))
        return fail(assertion, index, `binarne body — nie można sprawdzić ${assertion.path}`);
      const parsed = json();
      if (!parsed.ok)
        return fail(assertion, index, `body nie jest JSON — nie można sprawdzić ${assertion.path}`);
      const { found, value } = resolveJsonPath(parsed.value, assertion.path);
      if (!found)
        return fail(assertion, index, `${assertion.path} nie znaleziono`, assertion.expected);
      const ok = valueMatchesExpected(value, assertion.expected);
      return ok
        ? pass(assertion, index, `${assertion.path} = ${assertion.expected}`)
        : fail(
            assertion,
            index,
            `${assertion.path}: oczekiwano ${assertion.expected}`,
            assertion.expected,
            render(value),
          );
    }
    case "json_path_type": {
      if (bodyIsBinary(response))
        return fail(assertion, index, `binarne body — nie można sprawdzić ${assertion.path}`);
      const parsed = json();
      if (!parsed.ok)
        return fail(assertion, index, `body nie jest JSON — nie można sprawdzić ${assertion.path}`);
      const { found, value } = resolveJsonPath(parsed.value, assertion.path);
      if (!found)
        return fail(assertion, index, `${assertion.path} nie znaleziono`, assertion.expected_type);
      const actualType: JsonType = jsonType(value);
      const ok = actualType === assertion.expected_type;
      return ok
        ? pass(assertion, index, `${assertion.path}: ${actualType}`)
        : fail(
            assertion,
            index,
            `${assertion.path}: oczekiwano ${assertion.expected_type}`,
            assertion.expected_type,
            actualType,
          );
    }
    case "body_contains": {
      if (bodyIsBinary(response))
        return fail(assertion, index, `binarne body — wyszukiwanie tekstu niedostępne`);
      const ok = response.body.includes(assertion.substring);
      return ok
        ? pass(assertion, index, `body zawiera "${assertion.substring}"`)
        : fail(assertion, index, `body nie zawiera "${assertion.substring}"`, assertion.substring);
    }
    case "response_time_below": {
      const total = response.timings.total_ms;
      const ok = total < assertion.max_ms;
      return ok
        ? pass(assertion, index, `${total.toFixed(0)} ms < ${assertion.max_ms} ms`)
        : fail(
            assertion,
            index,
            `${total.toFixed(0)} ms >= ${assertion.max_ms} ms`,
            `< ${assertion.max_ms} ms`,
            `${total.toFixed(0)} ms`,
          );
    }
  }
}

/** Evaluate every assertion against a response. Results are in list order with a
 *  stable `index`. Disabled assertions become `skipped`. The body is parsed at
 *  most once and shared across all json_path_* checks. */
export function evalAssertions(
  response: ResponseData,
  assertions: Assertion[],
): AssertionResult[] {
  let parsedCache: { ok: boolean; value?: unknown; reason?: string } | null = null;
  const json = () => {
    if (parsedCache === null) parsedCache = parseJsonBody(response.body);
    return parsedCache;
  };

  return assertions.map((assertion, index) => {
    if (assertion.enabled === false) {
      return { assertion, index, status: "skipped", message: "wyłączone" };
    }
    return evalOne(response, assertion, index, json);
  });
}

export function summarize(results: AssertionResult[]): AssertionSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.status === "pass") passed += 1;
    else if (result.status === "fail") failed += 1;
    else skipped += 1;
  }
  return {
    total: results.length,
    passed,
    failed,
    skipped,
    allPassed: failed === 0,
  };
}
