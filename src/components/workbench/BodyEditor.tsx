import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { lintGutter, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import { variableAutocomplete } from "../../lib/completion/variableExtension";

interface BodyEditorProps {
  value: string;
  contentType: string;
  onChange: (text: string) => void;
}

// Minimal dark surface via tokens; CodeMirror owns syntax highlighting.
const editorTheme = EditorView.theme({
  "&": {
    fontSize: "var(--lok-fs-sm)",
    backgroundColor: "var(--lok-bg-code)",
    color: "var(--lok-text-primary)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--lok-bg-code)",
    border: "none",
    color: "var(--lok-text-disabled)",
  },
  ".cm-content": { fontFamily: "var(--lok-font-mono)" },
});

/** Pretty-print the buffer on blur when it parses as JSON. Bodies carrying
 *  `{{...}}` outside string values simply fail the parse and stay untouched,
 *  so interpolation templates are never mangled. */
const autoFormatJsonOnBlur = EditorView.domEventHandlers({
  blur: (_event, view) => {
    const text = view.state.doc.toString();
    if (text.trim() === "") return false;
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      if (pretty !== text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: pretty },
        });
      }
    } catch {
      // Not (yet) valid JSON — leave the buffer exactly as typed.
    }
    return false;
  },
});

/** CodeMirror 6 body editor. JSON content types get a non-blocking parse
 *  linter (Send is still allowed; Rust validates) and auto-format on blur. */
export function BodyEditor({ value, contentType, onChange }: BodyEditorProps) {
  const t = useT();
  const getCandidates = useVariableCandidates();
  const isJson = contentType.includes("json");
  // The `{{...}}` source returns null outside a `{{`, so it never conflicts with
  // JSON parsing/lint; mount it after json()/linter.
  const extensions = useMemo(() => {
    const variables = variableAutocomplete({ getCandidates });
    if (!isJson) return [editorTheme, variables];
    return [
      json(),
      linter(jsonParseLinter()),
      lintGutter(),
      editorTheme,
      variables,
      autoFormatJsonOnBlur,
    ];
  }, [isJson, getCandidates]);

  return (
    <div aria-label={t("workbench.requestBody")}>
      <CodeMirror
        value={value}
        theme="dark"
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
        onChange={onChange}
      />
    </div>
  );
}
