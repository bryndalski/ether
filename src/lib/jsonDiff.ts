// Structural JSON diff for Response Diff. Pure, framework-free, deterministic —
// walks two parsed JSON trees by shared keys/indices and classifies each leaf as
// added / removed / changed / type-changed. Distinguishing type-changed from a
// value-only change is an explicit requirement (docs/architecture/history-diff.md §5.1).
// Arrays diff positionally by index (no LCS/move detection) — a documented v1
// simplification kept for determinism.

import type { KeyValue } from "./types";

export type JsonPath = string; // "$", "$.a", "$.a.b[2]"
export type DiffKind = "added" | "removed" | "changed" | "type-changed";
export type JsonType =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object";

export interface JsonDiffEntry {
  path: JsonPath;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
  beforeType?: JsonType;
  afterType?: JsonType;
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/** JSON runtime type, distinguishing arrays from objects and null from object. */
export function jsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean" || t === "number" || t === "string") return t;
  return "object";
}

/** Parse a response body as JSON, guarding non-JSON / truncated bodies so the
 *  diff view can fall back to a raw text diff instead of throwing. */
export function parseJsonBody(body: string): ParseResult {
  const trimmed = body.trim();
  if (trimmed === "") return { ok: false, reason: "empty body" };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, reason: "non-JSON body" };
  }
}

function isBranch(type: JsonType): boolean {
  return type === "array" || type === "object";
}

function childPath(base: JsonPath, key: string | number): JsonPath {
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

function walk(
  before: unknown,
  after: unknown,
  path: JsonPath,
  out: JsonDiffEntry[],
): void {
  const beforeType = jsonType(before);
  const afterType = jsonType(after);

  // Both objects → diff by key union.
  if (beforeType === "object" && afterType === "object") {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
    for (const key of keys) {
      const inB = Object.prototype.hasOwnProperty.call(b, key);
      const inA = Object.prototype.hasOwnProperty.call(a, key);
      const p = childPath(path, key);
      if (inB && !inA) out.push({ path: p, kind: "removed", before: b[key] });
      else if (!inB && inA) out.push({ path: p, kind: "added", after: a[key] });
      else walk(b[key], a[key], p, out);
    }
    return;
  }

  // Both arrays → diff positionally.
  if (beforeType === "array" && afterType === "array") {
    const b = before as unknown[];
    const a = after as unknown[];
    const len = Math.max(b.length, a.length);
    for (let i = 0; i < len; i++) {
      const inB = i < b.length;
      const inA = i < a.length;
      const p = childPath(path, i);
      if (inB && !inA) out.push({ path: p, kind: "removed", before: b[i] });
      else if (!inB && inA) out.push({ path: p, kind: "added", after: a[i] });
      else walk(b[i], a[i], p, out);
    }
    return;
  }

  // Type changed (incl. object↔array, null↔object, number↔string).
  if (beforeType !== afterType) {
    out.push({ path, kind: "type-changed", before, after, beforeType, afterType });
    return;
  }

  // Same type. Branches were handled above; here only primitives remain.
  if (!isBranch(beforeType) && before !== after) {
    out.push({ path, kind: "changed", before, after });
  }
}

/** Flat, path-ordered structural diff of two parsed JSON values. */
export function jsonDiff(before: unknown, after: unknown): JsonDiffEntry[] {
  const out: JsonDiffEntry[] = [];
  walk(before, after, "$", out);
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

export type HeaderDiffKind = "added" | "removed" | "changed";

export interface HeaderDiffEntry {
  name: string;
  kind: HeaderDiffKind;
  before?: string;
  after?: string;
}

function joinValues(rows: KeyValue[], lowerName: string): string {
  return rows
    .filter((row) => row.name.toLowerCase() === lowerName)
    .map((row) => row.value)
    .join(", ");
}

/** Case-insensitive header diff. Multi-value headers join in order (v1). */
export function headersDiff(
  before: KeyValue[],
  after: KeyValue[],
): HeaderDiffEntry[] {
  const names = new Map<string, string>(); // lower → display name (from after, else before)
  for (const row of before) names.set(row.name.toLowerCase(), row.name);
  for (const row of after) names.set(row.name.toLowerCase(), row.name);

  const out: HeaderDiffEntry[] = [];
  for (const [lower, display] of [...names.entries()].sort()) {
    const inB = before.some((row) => row.name.toLowerCase() === lower);
    const inA = after.some((row) => row.name.toLowerCase() === lower);
    const beforeValue = joinValues(before, lower);
    const afterValue = joinValues(after, lower);
    if (inB && !inA) out.push({ name: display, kind: "removed", before: beforeValue });
    else if (!inB && inA) out.push({ name: display, kind: "added", after: afterValue });
    else if (beforeValue !== afterValue)
      out.push({ name: display, kind: "changed", before: beforeValue, after: afterValue });
  }
  return out;
}
