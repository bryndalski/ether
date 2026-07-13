import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { CompletionSource } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { singleLine } from "../../lib/completion/singleLine";
import { variableAutocomplete } from "../../lib/completion/variableExtension";
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
}: SingleLineCodeInputProps) {
  const extensions = useMemo(
    () => [
      makeTheme(fontSize),
      singleLine({ onEnter }),
      variableAutocomplete({ getCandidates, extraSources }),
    ],
    [fontSize, onEnter, getCandidates, extraSources],
  );

  return (
    <div className={className} aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        theme="dark"
        extensions={extensions}
        basicSetup={false}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}
