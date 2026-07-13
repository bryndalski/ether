import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { graphql } from "cm6-graphql";
import type { GraphQLSchema } from "graphql";
import { useT } from "../../i18n/useT";

interface QueryEditorProps {
  query: string;
  schema: GraphQLSchema | null;
  onChange: (text: string) => void;
}

// Minimal dark surface via tokens; cm6-graphql owns syntax/lint/hover.
const editorTheme = EditorView.theme({
  "&": {
    fontSize: "var(--lok-fs-sm)",
    backgroundColor: "var(--lok-bg-surface)",
    color: "var(--lok-text-primary)",
    height: "100%",
  },
  ".cm-gutters": {
    backgroundColor: "var(--lok-bg-surface)",
    border: "none",
    color: "var(--lok-text-disabled)",
  },
  ".cm-content": { fontFamily: "var(--lok-font-mono)" },
});

/** The centerpiece editor. With a schema, cm6-graphql gives autocomplete, lint,
 *  and hover/type-info; without one it degrades to syntax-only parsing. `{{...}}`
 *  templates are opaque string content, so linting is unaffected. */
export function QueryEditor({ query, schema, onChange }: QueryEditorProps) {
  const t = useT();
  const extensions = useMemo(
    () => [graphql(schema ?? undefined), editorTheme],
    [schema],
  );

  return (
    <div className="query-pane lok-scroll" aria-label={t("graphql.queryEditorAria")}>
      <CodeMirror
        value={query}
        theme="dark"
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        onChange={onChange}
      />
    </div>
  );
}
