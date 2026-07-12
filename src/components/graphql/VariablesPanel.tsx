import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

interface VariablesPanelProps {
  value: string;
  onChange: (text: string) => void;
}

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "var(--lok-fs-xs)",
    backgroundColor: "transparent",
    color: "var(--lok-text-primary)",
  },
  ".cm-gutters": { display: "none" },
  ".cm-content": { fontFamily: "var(--lok-font-mono)" },
});

/** JSON editor over graphql.variables_json. A non-blocking parse linter flags
 *  errors but Run is still allowed (Rust/endpoint validates). `{{env.x}}` inside
 *  a string value is preserved for Rust interpolation. */
export function VariablesPanel({ value, onChange }: VariablesPanelProps) {
  const extensions = useMemo(
    () => [json(), linter(jsonParseLinter()), editorTheme],
    [],
  );

  return (
    <div
      className="vars-body lok-scroll"
      role="tabpanel"
      aria-label="Zmienne operacji"
    >
      <CodeMirror
        value={value}
        theme="dark"
        extensions={extensions}
        basicSetup={{ lineNumbers: false, foldGutter: false }}
        onChange={onChange}
      />
    </div>
  );
}
