import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import { variableAutocomplete } from "../../lib/completion/variableExtension";

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
  const t = useT();
  const getCandidates = useVariableCandidates();
  const extensions = useMemo(
    () => [
      json(),
      linter(jsonParseLinter()),
      variableAutocomplete({ getCandidates }),
      editorTheme,
    ],
    [getCandidates],
  );

  return (
    <div
      className="vars-body lok-scroll"
      role="tabpanel"
      aria-label={t("graphql.variablesAria")}
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
