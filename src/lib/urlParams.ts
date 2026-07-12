// Params ↔ URL two-way sync helpers. Both are {{template}}-safe: they treat
// `{{...}}` tokens as opaque (never encode or split on them) so an authored
// query like ?limit={{env.pageSize}} survives a round-trip untouched.

import type { KeyValue } from "./types";

/** True when a value carries a template token we must leave verbatim. */
function hasTemplate(value: string): boolean {
  return value.includes("{{") && value.includes("}}");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // malformed percent-escapes stay as authored
  }
}

function safeEncode(value: string): string {
  // Preserve template tokens: encode the literal segments around each {{..}}.
  if (!hasTemplate(value)) return encodeURIComponent(value);
  return value
    .split(/(\{\{[^}]*\}\})/g)
    .map((part) => (hasTemplate(part) ? part : encodeURIComponent(part)))
    .join("");
}

/**
 * Parse the query string of a URL into KeyValue params. Preserves each param's
 * prior `enabled` flag by name when a `previous` list is supplied; new params
 * default to enabled. Template tokens survive un-encoded.
 */
export function parseQuery(url: string, previous: KeyValue[] = []): KeyValue[] {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return [];
  const query = url.slice(queryIndex + 1).split("#")[0];
  if (query === "") return [];

  const prevEnabled = new Map<string, boolean>();
  for (const param of previous) prevEnabled.set(param.name, param.enabled);

  return query
    .split("&")
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const rawName = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
      const name = safeDecode(rawName);
      const value = safeDecode(rawValue);
      return { name, value, enabled: prevEnabled.get(name) ?? true };
    });
}

/**
 * Rebuild the query portion of a URL from the enabled params, leaving
 * scheme/host/path and any `{{templates}}` in them untouched. Disabled params
 * are dropped from the URL (they stay in the params list for later re-enable).
 */
export function buildUrl(url: string, params: KeyValue[]): string {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);

  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);

  const query = params
    .filter((param) => param.enabled && param.name !== "")
    .map((param) => `${safeEncode(param.name)}=${safeEncode(param.value)}`)
    .join("&");

  return query === "" ? `${base}${hash}` : `${base}?${query}${hash}`;
}
