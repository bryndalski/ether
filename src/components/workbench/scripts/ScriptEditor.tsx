import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";

interface ScriptEditorProps {
  value: string;
  ariaLabel: string;
  placeholder: string;
  onChange: (text: string) => void;
}

// Minimal dark surface via the shared code tokens (same as BodyEditor);
// CodeMirror owns JS syntax highlighting.
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

/** CodeMirror 6 JS editor for a pre/post-request script. No blocking linter —
 *  the sandbox validates on Run, and syntax errors surface as a script error. */
export function ScriptEditor({
  value,
  ariaLabel,
  placeholder,
  onChange,
}: ScriptEditorProps) {
  const extensions = useMemo(() => [javascript(), editorTheme], []);

  return (
    <div aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        theme="dark"
        placeholder={placeholder}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
        onChange={onChange}
      />
    </div>
  );
}
