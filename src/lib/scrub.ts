// Replaces non-deterministic leaf values with a placeholder BEFORE a snapshot
// diff, so timestamps/UUIDs/configured JSONPaths never cause false failures.
// Pure & non-mutating: always deep-clones; the live response stays untouched.
// Mirrors docs/architecture/testing.md §2.2.

import { parseJsonBody } from "./jsonDiff";
import type { ScrubConfig } from "./types";

export const SCRUBBED = "{{scrubbed}}";

// Conservative ISO-8601 date-time; a bare date (no T) is intentionally NOT matched.
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const RFC4122_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Split a JSONPath into its ordered segments (string key | numeric index). */
function pathSegments(path: string): (string | number)[] | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("$")) return null;
  const tokens = trimmed.slice(1).match(/\.[^.[\]]+|\[\d+\]/g);
  if (trimmed === "$") return [];
  if (!tokens) return null;
  return tokens.map((token) =>
    token.startsWith("[") ? Number(token.slice(1, -1)) : token.slice(1),
  );
}

/** Deep clone via structuredClone with a JSON fallback (values here are always
 *  JSON-derived, so both are safe and deterministic). */
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Set the node addressed by `segments` to SCRUBBED, in place, on a clone. */
function scrubAtPath(root: unknown, segments: (string | number)[]): void {
  if (segments.length === 0) return; // "$" points at the whole tree; caller handles
  let parent: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (parent === null || typeof parent !== "object") return;
    parent = (parent as Record<string | number, unknown>)[segments[i]];
  }
  if (parent === null || typeof parent !== "object") return;
  const last = segments[segments.length - 1];
  if (!Object.prototype.hasOwnProperty.call(parent, last)) return;
  (parent as Record<string | number, unknown>)[last] = SCRUBBED;
}

/** Recursively replace auto-matched string leaves (timestamps / UUIDs). */
function scrubAuto(node: unknown, config: ScrubConfig): unknown {
  if (typeof node === "string") {
    if (config.auto_timestamps && ISO_DATETIME.test(node)) return SCRUBBED;
    if (config.auto_uuids && RFC4122_UUID.test(node)) return SCRUBBED;
    return node;
  }
  if (Array.isArray(node)) return node.map((child) => scrubAuto(child, config));
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node as Record<string, unknown>)) {
      out[key] = scrubAuto((node as Record<string, unknown>)[key], config);
    }
    return out;
  }
  return node;
}

/** Deep clone with matched leaves replaced by SCRUBBED. Never mutates input. */
export function scrubValue(value: unknown, config: ScrubConfig): unknown {
  // Auto pass first (produces a fresh clone), then explicit paths on that clone.
  let result = scrubAuto(value, config);
  if (result === value) result = clone(value); // no auto matches → still clone
  for (const path of config.paths) {
    if (path.trim() === "$") return SCRUBBED;
    const segments = pathSegments(path);
    if (segments) scrubAtPath(result, segments);
  }
  return result;
}

export type ScrubBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/** Parse a body then scrub, or report why scrubbing is impossible (non-JSON). */
export function scrubBody(body: string, config: ScrubConfig): ScrubBodyResult {
  const parsed = parseJsonBody(body);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, value: scrubValue(parsed.value, config) };
}
