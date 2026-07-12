import { useMemo } from "react";
import type { ReactNode } from "react";
import type { RequestDraft, DraftAction } from "../../hooks/useRequestDraft";
import type { SendState } from "../../hooks/useSendRequest";
import { useGraphqlSchema } from "../../hooks/useGraphqlSchema";
import { useGraphqlBuilder } from "../../hooks/useGraphqlBuilder";
import { useDocsNav } from "../../hooks/useDocsNav";
import {
  availableOperations,
  rootTypeFor,
} from "../../lib/graphqlSchemaTree";
import { relativeTimeLabel } from "../../lib/relativeTime";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { FieldTree } from "./FieldTree";
import { QueryEditor } from "./QueryEditor";
import { OperationVarsPanel } from "./OperationVarsPanel";
import { DocsExplorer } from "./DocsExplorer";
import { ExplorerStatusBar } from "./ExplorerStatusBar";
import { SdlFallbackPanel } from "./SdlFallbackPanel";
import { EmptyState } from "../common/EmptyState";

interface GraphqlExplorerProps {
  draft: RequestDraft;
  dispatch: React.Dispatch<DraftAction>;
  sendState: SendState;
  onRun: () => void;
  onCancel: () => void;
  // Shared workbench controls, so the single explorer toolbar carries them and
  // no duplicate RequestBar is rendered in GraphQL mode.
  requestTypeToggle?: ReactNode;
  onSave?: () => void;
  onCopyCurl?: () => void;
  dirty?: boolean;
}

/** Container: owns the schema + builder hooks and lays out the mock grid
 *  (toolbar → 3 columns → statusbar). All logic lives in the hooks; this view
 *  just wires and lays out. */
export function GraphqlExplorer({
  draft,
  dispatch,
  sendState,
  onRun,
  onCancel,
  requestTypeToggle,
  onSave,
  onCopyCurl,
  dirty,
}: GraphqlExplorerProps) {
  const schemaApi = useGraphqlSchema(draft);
  const builder = useGraphqlBuilder(draft, schemaApi.schema, dispatch);

  const availableOps = useMemo(
    () => (schemaApi.schema ? availableOperations(schemaApi.schema) : ["query" as const]),
    [schemaApi.schema],
  );
  const rootType = useMemo(
    () => (schemaApi.schema ? rootTypeFor(schemaApi.schema, builder.opType) : null),
    [schemaApi.schema, builder.opType],
  );
  const docsNav = useDocsNav(rootType?.name ?? null);

  const runDisabled =
    draft.url.trim() === "" || builder.query.trim() === "";

  return (
    <div className="gql-explorer">
      <ExplorerToolbar
        opType={builder.opType}
        availableOps={availableOps}
        onOpType={builder.setOpType}
        url={draft.url}
        onUrl={(url) => dispatch({ kind: "setUrl", url })}
        schemaState={schemaApi.state}
        onRefresh={() => void schemaApi.refresh()}
        sendState={sendState}
        runDisabled={runDisabled}
        onRun={onRun}
        onCancel={onCancel}
        requestTypeToggle={requestTypeToggle}
        onSave={onSave}
        onCopyCurl={onCopyCurl}
        dirty={dirty}
      />

      <div className="gql-cols">
        {schemaApi.schema && rootType ? (
          <FieldTree
            rootType={rootType}
            isSelected={builder.isSelected}
            onToggle={builder.toggleField}
            onFocusType={docsNav.focusType}
          />
        ) : (
          <div className="gql-col tree-col">
            <div className="col-head">Fields</div>
            <div className="col-body lok-scroll">
              <EmptyState
                headline={
                  schemaApi.state === "introspecting"
                    ? "Introspecting…"
                    : "No schema yet"
                }
                hint="Refresh schema to introspect this endpoint, or paste SDL."
                icon="~"
              />
            </div>
          </div>
        )}

        <div className="gql-col mid">
          {schemaApi.state === "sdl-fallback" && !schemaApi.schema ? (
            <SdlFallbackPanel
              sdlText={schemaApi.sdlText}
              error={schemaApi.error}
              onApply={schemaApi.applySdl}
            />
          ) : schemaApi.state === "error" ? (
            <SdlFallbackPanel
              sdlText={schemaApi.sdlText}
              error={schemaApi.error}
              onApply={schemaApi.applySdl}
            />
          ) : (
            <div className="gql-mid-split">
              <QueryEditor
                query={builder.query}
                schema={schemaApi.schema}
                onChange={builder.setQuery}
              />
              <OperationVarsPanel
                variablesJson={builder.variablesJson}
                onVariablesChange={builder.setVariables}
                headers={draft.headers}
                onHeadersChange={(headers) =>
                  dispatch({ kind: "setHeaders", headers })
                }
              />
            </div>
          )}
        </div>

        {schemaApi.schema ? (
          <DocsExplorer schema={schemaApi.schema} nav={docsNav} />
        ) : (
          <div className="gql-col docs-col">
            <div className="col-head">Docs Explorer</div>
            <div className="col-body lok-scroll">
              <EmptyState
                headline="Docs appear here"
                hint="Once a schema is loaded, drill into types."
                icon="~"
              />
            </div>
          </div>
        )}
      </div>

      <ExplorerStatusBar
        schemaState={schemaApi.state}
        typeCount={schemaApi.typeCount}
        selectedFieldCount={builder.selection.size}
        lastRefreshLabel={relativeTimeLabel(schemaApi.lastRefreshedAt)}
      />
    </div>
  );
}
