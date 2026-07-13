// Static header-name + Content-Type value catalogs and their completion
// sources. These are small closed sets, so they are plain data (not env/secret/
// dynamic). Header VALUES still get `{{...}}` completion via variableAutocomplete;
// this only adds the closed-list suggestions on top.

import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

/** Common request header names in canonical casing. */
export const COMMON_HEADER_NAMES: readonly string[] = [
  "Content-Type",
  "Authorization",
  "Accept",
  "Accept-Encoding",
  "Accept-Language",
  "User-Agent",
  "X-Request-Id",
  "X-Api-Key",
  "Cache-Control",
  "Cookie",
  "Origin",
  "Referer",
  "If-None-Match",
  "If-Modified-Since",
  "Content-Length",
];

/** Common Content-Type values. */
export const CONTENT_TYPE_VALUES: readonly string[] = [
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
  "application/xml",
  "text/html",
  "application/octet-stream",
  "application/graphql-response+json",
];

/** Case-insensitive startsWith-boosted ranking over a closed string list. */
function rankStatic(values: readonly string[], prefix: string): string[] {
  const needle = prefix.toLowerCase();
  const matched = values.filter((value) =>
    value.toLowerCase().includes(needle),
  );
  return matched.sort((a, b) => {
    const aStarts = a.toLowerCase().startsWith(needle) ? 1 : 0;
    const bStarts = b.toLowerCase().startsWith(needle) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    return a.localeCompare(b);
  });
}

function toOptions(values: string[]): Completion[] {
  return values.map((value) => ({ label: value, apply: value }));
}

/**
 * Completion source matching a whole single-token header-name cell against
 * COMMON_HEADER_NAMES (used for the header-name field when it is a CM editor;
 * a native `<datalist>` covers the plain-input case).
 */
export function headerNameCompletionSource(): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const prefix = before.trimStart();
    const from = context.pos - prefix.length;

    const ranked = rankStatic(COMMON_HEADER_NAMES, prefix);
    if (ranked.length === 0) return null;

    return { from, to: context.pos, filter: false, options: toOptions(ranked) };
  };
}

/**
 * Completion source adding Content-Type MIME values to a header VALUE cell,
 * active only when that row's header name (case-insensitive) is `content-type`.
 * `getHeaderName` reads the row's current name so the source can gate itself.
 */
export function contentTypeValueCompletionSource(
  getHeaderName: () => string,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    if (getHeaderName().trim().toLowerCase() !== "content-type") return null;

    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    // Do not fight the `{{...}}` source inside an open token.
    const openIndex = before.lastIndexOf("{{");
    if (openIndex !== -1 && !before.slice(openIndex).includes("}}")) return null;

    const prefix = before.trimStart();
    const from = context.pos - prefix.length;

    const ranked = rankStatic(CONTENT_TYPE_VALUES, prefix);
    if (ranked.length === 0) return null;

    return { from, to: context.pos, filter: false, options: toOptions(ranked) };
  };
}
