import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { lintGutter, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

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

/** CodeMirror 6 body editor. JSON content types get a non-blocking parse
 *  linter (Send is still allowed; Rust validates). */
export function BodyEditor({ value, contentType, onChange }: BodyEditorProps) {
  const isJson = contentType.includes("json");
  const extensions = useMemo(() => {
    if (!isJson) return [editorTheme];
    return [json(), linter(jsonParseLinter()), lintGutter(), editorTheme];
  }, [isJson]);

  return (
    <div aria-label="Treść requestu">
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
