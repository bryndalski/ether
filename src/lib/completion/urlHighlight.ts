// Purely-visual URL part highlighting for the request URL bar: the scheme +
// host read in the primary text color, the path in secondary, and everything
// after `?` (the query) in the brand heat so params stand out at a glance.
// `{{...}}` template tokens are left untouched here — the shared tokenPillPlugin
// (variableExtension) paints those on top, so we deliberately never split on
// or restyle a token's characters.

import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const hostMark = Decoration.mark({ class: "cm-lok-url-host" });
const pathMark = Decoration.mark({ class: "cm-lok-url-path" });
const queryMark = Decoration.mark({ class: "cm-lok-url-query" });

export interface UrlRange {
  from: number;
  to: number;
  part: "host" | "path" | "query";
}

/**
 * Split a URL string into host / path / query ranges. The host is the scheme +
 * authority up to the first `/` (or the whole thing if there is no path); the
 * path runs to the first `?`; the query is the remainder. Empty ranges are
 * skipped so callers never emit zero-width decorations. Pure + view-free so it
 * can be unit-tested without a CodeMirror EditorView.
 */
export function computeUrlRanges(text: string): UrlRange[] {
  if (text === "") return [];

  const queryStart = text.indexOf("?");
  const beforeQuery = queryStart === -1 ? text : text.slice(0, queryStart);

  // Host boundary: first "/" after the scheme's "//" (so it survives https://).
  const schemeEnd = beforeQuery.indexOf("//");
  const pathSearchFrom = schemeEnd === -1 ? 0 : schemeEnd + 2;
  const slash = beforeQuery.indexOf("/", pathSearchFrom);
  const hostEnd = slash === -1 ? beforeQuery.length : slash;

  const ranges: UrlRange[] = [];
  if (hostEnd > 0) ranges.push({ from: 0, to: hostEnd, part: "host" });
  if (beforeQuery.length > hostEnd)
    ranges.push({ from: hostEnd, to: beforeQuery.length, part: "path" });
  if (queryStart !== -1 && text.length > queryStart)
    ranges.push({ from: queryStart, to: text.length, part: "query" });
  return ranges;
}

const MARK_BY_PART = { host: hostMark, path: pathMark, query: queryMark };

function buildUrlDeco(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of computeUrlRanges(view.state.doc.toString()))
    builder.add(range.from, range.to, MARK_BY_PART[range.part]);
  return builder.finish();
}

/** Highlight URL parts (host/path/query) as a low-precedence decoration layer. */
export const urlPartHighlight = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    constructor(view: EditorView) {
      this.deco = buildUrlDeco(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged)
        this.deco = buildUrlDeco(update.view);
    }
  },
  { decorations: (instance) => instance.deco },
);
