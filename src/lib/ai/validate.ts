// Total, pure narrowing of a model's structured output INTO the existing model
// types. A malformed/hostile completion never reaches a store — it becomes a
// typed error the caller surfaces as a toast. The model can never emit an
// off-contract field: everything here is a validation, not a translation.
// See docs/architecture/local-ai.md §2.2.

import type { Assertion, AssertionType, KeyValue } from "../types";
import { defaultAssertion } from "../assertionDefaults";
import type { AiActionKind } from "./types";

/** The closed assertion vocabulary — the ONLY `type` values we accept from the
 *  model. Anything else is dropped. Kept in sync with the `Assertion` union. */
export const ASSERTION_TYPES: readonly AssertionType[] = [
  "status_equals",
  "status_in_range",
  "header_exists",
  "header_equals",
  "json_path_exists",
  "json_path_equals",
  "json_path_type",
  "body_contains",
  "response_time_below",
];

const JSON_TYPES = ["object", "array", "string", "number", "boolean", "null"] as const;

export interface RequestArtifact {
  method: string;
  url: string;
  headers: KeyValue[];
  bodyText: string | null;
}

export interface GraphqlArtifact {
  query: string;
  variablesJson: string;
}

export type ArtifactResult =
  | { ok: true; kind: "assertions"; assertions: Assertion[] }
  | { ok: true; kind: "request"; request: RequestArtifact }
  | { ok: true; kind: "graphql"; graphql: GraphqlArtifact }
  | { ok: true; kind: "markdown"; markdown: string }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Narrow one raw item into a legal `Assertion`, reusing `defaultAssertion` as
 *  the field template so the survivor deep-equals a hand-built default (plus the
 *  model-supplied slots). Off-vocabulary or malformed → null (dropped). */
function narrowAssertion(raw: unknown): Assertion | null {
  const record = asRecord(raw);
  if (!record || !isString(record.type)) return null;
  const type = record.type as AssertionType;
  if (!ASSERTION_TYPES.includes(type)) return null;

  const base = defaultAssertion(type);
  const merged = { ...base, enabled: true } as Assertion;

  switch (merged.type) {
    case "status_equals":
      if (typeof record.expected === "number") merged.expected = record.expected;
      return merged;
    case "status_in_range":
      if (typeof record.min === "number") merged.min = record.min;
      if (typeof record.max === "number") merged.max = record.max;
      return merged;
    case "header_exists":
      if (isString(record.name)) merged.name = record.name;
      return merged;
    case "header_equals":
      if (isString(record.name)) merged.name = record.name;
      if (record.expected != null) merged.expected = String(record.expected);
      return merged;
    case "json_path_exists":
      if (isString(record.path)) merged.path = record.path;
      return merged;
    case "json_path_equals":
      if (isString(record.path)) merged.path = record.path;
      if (record.expected != null) merged.expected = String(record.expected);
      return merged;
    case "json_path_type":
      if (isString(record.path)) merged.path = record.path;
      if (isString(record.expected_type) && (JSON_TYPES as readonly string[]).includes(record.expected_type))
        merged.expected_type = record.expected_type as (typeof JSON_TYPES)[number];
      return merged;
    case "body_contains":
      if (isString(record.substring)) merged.substring = record.substring;
      return merged;
    case "response_time_below":
      if (typeof record.max_ms === "number") merged.max_ms = record.max_ms;
      return merged;
  }
}

function narrowHeaders(raw: unknown): KeyValue[] {
  if (!Array.isArray(raw)) return [];
  const out: KeyValue[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (record && isString(record.name) && isString(record.value)) {
      out.push({ name: record.name, value: record.value, enabled: true });
    }
  }
  return out;
}

/**
 * Narrow the model's structured output into an artifact for the given action,
 * or return a typed error. Pure + total: never throws, never touches a store.
 */
export function validateArtifact(action: AiActionKind, rawJson: unknown): ArtifactResult {
  const record = asRecord(rawJson);
  if (!record) return { ok: false, error: "not-an-object" };

  switch (action) {
    case "generate-assertions": {
      const list = Array.isArray(record.assertions) ? record.assertions : null;
      if (!list) return { ok: false, error: "missing-assertions" };
      const assertions = list
        .map(narrowAssertion)
        .filter((a): a is Assertion => a !== null);
      return { ok: true, kind: "assertions", assertions };
    }
    case "nl-to-request": {
      if (!isString(record.method) || !isString(record.url)) {
        return { ok: false, error: "missing-method-or-url" };
      }
      return {
        ok: true,
        kind: "request",
        request: {
          method: record.method.toUpperCase(),
          url: record.url,
          headers: narrowHeaders(record.headers),
          bodyText: isString(record.body_text) ? record.body_text : null,
        },
      };
    }
    case "nl-to-graphql": {
      if (!isString(record.query) || record.query.trim() === "") {
        return { ok: false, error: "missing-query" };
      }
      return {
        ok: true,
        kind: "graphql",
        graphql: {
          query: record.query,
          variablesJson: isString(record.variables_json) ? record.variables_json : "{}",
        },
      };
    }
    case "explain-error":
    case "document-request": {
      if (!isString(record.markdown) || record.markdown.trim() === "") {
        return { ok: false, error: "missing-markdown" };
      }
      return { ok: true, kind: "markdown", markdown: record.markdown };
    }
  }
}
