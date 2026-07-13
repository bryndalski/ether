import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { CompletionSource } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { singleLine } from "../../lib/completion/singleLine";
import { variableAutocomplete } from "../../lib/completion/variableExtension";
import { urlPartHighlight } from "../../lib/completion/urlHighlight";
import type { GetCandidates } from "../../hooks/useVariableCandidates";

interface SingleLineCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  getCandidates: GetCandidates;
  ariaLabel: string;
  placeholder?: string;
  /** CSS font-size token, e.g. "var(--lok-fs-md)". Defaults to --lok-fs-sm. */
  fontSize?: string;
  onEnter?: () => void;
  extraSources?: CompletionSource[];
  className?: string;
  /** Paint URL parts (host/path/query) in distinct colors — for the URL bar. */
  highlightUrl?: boolean;
  /** Soft-wrap long content. Default true; false = flat, horizontally-scrolling
   *  row that never grows in height (the URL bar). */
  wrap?: boolean;
}

// One-line surface: no gutters, no line numbers, flat height, monospace.
function makeTheme(fontSize: string) {
  return EditorView.theme({
    "&": {
      fontSize,
      backgroundColor: "var(--lok-bg-input)",
      color: "var(--lok-text-primary)",
    },
    ".cm-content": {
      fontFamily: "var(--lok-font-mono)",
      padding: "var(--lok-space-1) 0",
    },
    ".cm-line": { padding: "0 var(--lok-space-2)" },
    ".cm-scroller": { overflowX: "auto", overflowY: "hidden" },
  });
}

/**
 * A single-line CodeMirror input carrying the shared `{{...}}` autocomplete.
 * Used by the URL bar and KeyValue value cells so the token popup, filtering,
 * snippet insertion, keyboard model and a11y are identical everywhere.
 */
export function SingleLineCodeInput({
  value,
  onChange,
  getCandidates,
  ariaLabel,
  placeholder,
  fontSize = "var(--lok-fs-sm)",
  onEnter,
  extraSources,
  className,
  highlightUrl = false,
  wrap = true,
}: SingleLineCodeInputProps) {
  const extensions = useMemo(
    () => [
      makeTheme(fontSize),
      singleLine({ onEnter, wrap }),
      variableAutocomplete({ getCandidates, extraSources }),
      ...(highlightUrl ? [urlPartHighlight] : []),
      // Flat rows scroll to the tail while typing a long value; on blur, snap
      // back to the start so the protocol/host stays readable at rest.
      ...(wrap
        ? []
        : [
            EditorView.domEventHandlers({
              blur: (_event, view) => {
                view.scrollDOM.scrollLeft = 0;
                return false;
              },
            }),
          ]),
    ],
    [fontSize, onEnter, getCandidates, extraSources, highlightUrl, wrap],
  );

  return (
    <div className={className} aria-label={ariaLabel} title={value || undefined}>
      <CodeMirror
        value={value}
        theme="none"
        extensions={extensions}
        basicSetup={false}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}
