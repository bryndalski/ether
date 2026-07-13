// The one CM extension bundle every editable field imports: the `{{...}}`
// completion (plus any extra static sources), the Mod-Space force-open keymap,
// and a MatchDecorator that paints existing `{{...}}` tokens as heat-tinted
// pills. This is the single mount point so behaviour/styling never drift.

import {
  autocompletion,
  completionKeymap,
  startCompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { VarCandidate } from "./variableCandidates";
import { variableCompletionSource } from "./variableCompletion";

export interface VariableAutocompleteOptions {
  getCandidates: () => VarCandidate[];
  /** Extra completion sources merged alongside the `{{...}}` source (e.g. the
   *  Content-Type value list or GraphQL operation-var keys). */
  extraSources?: CompletionSource[];
}

const tokenMatcher = new MatchDecorator({
  // At least one name char — a bare `{{}}` mid-typing must NOT light up as a
  // hot token pill (it reads as an alarm in the URL bar).
  regexp: /\{\{[^}]+\}\}/g,
  decoration: Decoration.mark({ class: "cm-lok-token" }),
});

// Purely visual: highlight already-inserted `{{...}}` tokens as pills.
const tokenPillPlugin = ViewPlugin.fromClass(
  class {
    tokens: DecorationSet;
    constructor(view: EditorView) {
      this.tokens = tokenMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.tokens = tokenMatcher.updateDeco(update, this.tokens);
    }
  },
  { decorations: (instance) => instance.tokens },
);

/**
 * Build the shared `{{...}}` autocomplete extension for a CodeMirror editor.
 * `icons:false` because we render our own kind-glyph via CSS on the label.
 */
export function variableAutocomplete(
  options: VariableAutocompleteOptions,
): Extension {
  const sources: CompletionSource[] = [
    variableCompletionSource(options.getCandidates),
    ...(options.extraSources ?? []),
  ];
  return [
    autocompletion({
      override: sources,
      activateOnTyping: true,
      closeOnBlur: true,
      icons: false,
      aboveCursor: false,
    }),
    tokenPillPlugin,
    // Mod-Space force-opens even without typing `{{`; completionKeymap owns the
    // arrow/Enter/Escape handling and must run before single-line Enter/Escape.
    Prec.high(
      keymap.of([
        { key: "Mod-Space", run: startCompletion },
        ...completionKeymap,
      ]),
    ),
  ];
}
