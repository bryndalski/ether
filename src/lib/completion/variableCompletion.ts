// The reusable CodeMirror completion source for `{{...}}` tokens. It reads the
// live candidate list via an injected getter (so a runtime env switch needs no
// editor remount) and owns its own prefix matching against the namespaced
// label. It is silent outside an open `{{`, so it never fights cm6-graphql or
// the JSON linter.

import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import { snippet } from "@codemirror/autocomplete";
import type { VarCandidate } from "./variableCandidates";

// Matches an open, unclosed `{{` immediately left of the caret and captures the
// partial token typed after it (may be empty right after typing `{{`).
const OPEN_TOKEN = /\{\{\s*([\w.$()]*)$/;

/** True when the region between the open `{{` and the caret contains a closing
 *  `}}` (i.e. the `{{` is already closed, so we must not fire). */
function tokenIsClosed(before: string, openIndex: number): boolean {
  return before.slice(openIndex).includes("}}");
}

/** Rank: startsWith beats includes, then by candidate boost, then label. */
function rankCandidates(candidates: VarCandidate[], prefix: string): VarCandidate[] {
  const needle = prefix.toLowerCase();
  const matched = candidates.filter((candidate) =>
    candidate.label.toLowerCase().includes(needle),
  );
  return matched.sort((a, b) => {
    const aStarts = a.label.toLowerCase().startsWith(needle) ? 1 : 0;
    const bStarts = b.label.toLowerCase().startsWith(needle) ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    if (a.boost !== b.boost) return b.boost - a.boost;
    return a.label.localeCompare(b.label);
  });
}

function toCompletion(candidate: VarCandidate): Completion {
  const base: Completion = {
    label: candidate.label,
    type: candidate.kind,
    detail: candidate.detail,
    boost: candidate.boost,
  };
  if (candidate.isSnippet) {
    // snippet() returns an apply fn honouring ${1:..} tab-stops and caret.
    return { ...base, apply: snippet(candidate.insert) };
  }
  return { ...base, apply: candidate.insert };
}

/**
 * Build a completion source for `{{...}}` tokens. `getCandidates` is called on
 * every trigger so the list is always live.
 */
export function variableCompletionSource(
  getCandidates: () => VarCandidate[],
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    const match = OPEN_TOKEN.exec(before);
    if (!match) return null;

    const openIndex = before.lastIndexOf("{{");
    if (openIndex === -1 || tokenIsClosed(before, openIndex)) return null;

    const prefix = match[1] ?? "";
    // Replace from the `{{` itself: each candidate's `insert` carries its own
    // braces, so this keeps exactly one set regardless of what the user typed.
    const from = line.from + openIndex;

    const ranked = rankCandidates(getCandidates(), prefix);
    if (ranked.length === 0) return null;

    return {
      from,
      to: context.pos,
      // We own matching against the namespaced label, so disable CM's filter.
      filter: false,
      options: ranked.map(toCompletion),
    };
  };
}
