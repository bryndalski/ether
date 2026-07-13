// Extensions that make a CodeMirror editor behave like a one-line <input>:
// no newlines, Enter submits, Escape blurs (after closing any open completion).
// Used by SingleLineCodeInput for the URL bar and KeyValue value cells.

import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

export interface SingleLineOptions {
  /** Called when Enter is pressed with no completion popup open. */
  onEnter?: () => void;
  /** Soft-wrap long content onto multiple visual lines. Default true. When
   *  false the line stays flat and scrolls horizontally (the URL-bar model —
   *  the row height never grows, so it can't overlap the tabs below). */
  wrap?: boolean;
}

/** Reject any transaction that would insert a newline, so the doc stays flat. */
const noNewlines = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged) return transaction;
  let hasNewline = false;
  transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.lines > 1) hasNewline = true;
  });
  return hasNewline ? [] : transaction;
});

/**
 * Build the single-line behaviour extension set. Enter runs `onEnter`; the
 * completion keymap (registered by variableAutocomplete at higher precedence)
 * intercepts Enter/Escape first when a popup is open, so Enter only submits and
 * Escape only blurs once the popup is closed.
 */
export function singleLine(options: SingleLineOptions = {}): Extension {
  const wrap = options.wrap ?? true;
  return [
    ...(wrap ? [EditorView.lineWrapping] : []),
    noNewlines,
    Prec.low(
      keymap.of([
        {
          key: "Enter",
          run: () => {
            options.onEnter?.();
            return true;
          },
        },
        {
          key: "Escape",
          run: (view) => {
            view.contentDOM.blur();
            return true;
          },
        },
      ]),
    ),
  ];
}
