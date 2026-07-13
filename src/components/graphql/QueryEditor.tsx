import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { graphql, updateSchema } from "cm6-graphql";
import type { GraphQLSchema } from "graphql";
import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import { variableAutocomplete } from "../../lib/completion/variableExtension";

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

/** The centerpiece editor. With a schema, cm6-graphql gives full autocomplete of
 *  fields inside a selection-set, arguments, and variable types, plus validation
 *  lint; without one it degrades to syntax-only parsing. The schema is installed
 *  ONCE (stable extension) and refreshed imperatively via `updateSchema`, so a
 *  schema that arrives after the editor mounts — or after a Refresh — starts
 *  driving completion without remounting the editor. `{{...}}` templates are
 *  opaque string content, so linting is unaffected. */
export function QueryEditor({ query, schema, onChange }: QueryEditorProps) {
  const t = useT();
  const getCandidates = useVariableCandidates();
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  // cm6-graphql owns schema completion/lint; our `{{...}}` source returns null
  // unless inside an open `{{`, so the two completion sources coexist. The
  // graphql extension is created ONCE (schema omitted) and fed via updateSchema.
  const extensions = useMemo(
    () => [
      graphql(),
      variableAutocomplete({ getCandidates }),
      editorTheme,
    ],
    [getCandidates],
  );

  // Push the schema into the running editor whenever it (re)loads.
  useEffect(() => {
    const view = cmRef.current?.view;
    if (view) updateSchema(view, schema ?? undefined);
  }, [schema]);

  return (
    <div className="query-pane lok-scroll" aria-label={t("graphql.queryEditorAria")}>
      <CodeMirror
        ref={cmRef}
        value={query}
        theme="dark"
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        placeholder={t("graphql.queryPlaceholder")}
        onChange={onChange}
        onCreateEditor={(view) => updateSchema(view, schema ?? undefined)}
      />
    </div>
  );
}
