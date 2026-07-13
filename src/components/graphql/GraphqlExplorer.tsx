import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { RequestDraft, DraftAction } from "../../hooks/useRequestDraft";
import type { SendState } from "../../hooks/useSendRequest";
import { useGraphqlSchema } from "../../hooks/useGraphqlSchema";
import { useGraphqlBuilder } from "../../hooks/useGraphqlBuilder";
import { useDocsNav } from "../../hooks/useDocsNav";
import { useSubscription } from "../../hooks/useSubscription";
import {
  availableOperations,
  rootFieldCounts,
  rootTypeFor,
} from "../../lib/graphqlSchemaTree";
import { relativeTimeLabel } from "../../lib/relativeTime";
import { useT } from "../../i18n/useT";
import type { StoredRequest } from "../../lib/types";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { FieldTree } from "./FieldTree";
import { QueryEditor } from "./QueryEditor";
import { OperationVarsPanel } from "./OperationVarsPanel";
import { DocsExplorer } from "./DocsExplorer";
import { ExplorerStatusBar } from "./ExplorerStatusBar";
import { SdlFallbackPanel } from "./SdlFallbackPanel";
import { SubscribeButton } from "./SubscribeButton";
import { SubscriptionStream } from "./SubscriptionStream";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { ResizeHandle } from "../common/ResizeHandle";
import { useUiStore } from "../../state/useUiStore";

interface GraphqlExplorerProps {
  draft: RequestDraft;
  dispatch: React.Dispatch<DraftAction>;
  sendState: SendState;
  onRun: () => void;
  onCancel: () => void;
  // The active environment id so a subscription resolves {{env}}/{{secret}} in
  // Rust exactly like a one-shot send does.
  environmentId?: string | null;
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
  environmentId = null,
  requestTypeToggle,
  onSave,
  onCopyCurl,
  dirty,
}: GraphqlExplorerProps) {
  const t = useT();
  const schemaApi = useGraphqlSchema(draft);
  const builder = useGraphqlBuilder(draft, schemaApi.schema, dispatch);
  const stream = useSubscription();

  // Draggable column widths (persisted). The middle editor keeps the remaining
  // 1fr; dragging the left handle grows the tree, the right handle grows docs.
  const treeWidth = useUiStore((state) => state.gqlTreeWidth);
  const docsWidth = useUiStore((state) => state.gqlDocsWidth);
  const setTreeWidth = useUiStore((state) => state.setGqlTreeWidth);
  const setDocsWidth = useUiStore((state) => state.setGqlDocsWidth);
  const resetTreeWidth = useUiStore((state) => state.resetGqlTreeWidth);
  const resetDocsWidth = useUiStore((state) => state.resetGqlDocsWidth);

  const availableOps = useMemo(
    () => (schemaApi.schema ? availableOperations(schemaApi.schema) : ["query" as const]),
    [schemaApi.schema],
  );
  const rootType = useMemo(
    () => (schemaApi.schema ? rootTypeFor(schemaApi.schema, builder.opType) : null),
    [schemaApi.schema, builder.opType],
  );
  const opCounts = useMemo(
    () =>
      schemaApi.schema
        ? rootFieldCounts(schemaApi.schema)
        : { query: 0, mutation: 0, subscription: 0 },
    [schemaApi.schema],
  );
  const docsNav = useDocsNav(rootType?.name ?? null);

  const isSubscription = builder.opType === "subscription";

  // Build the StoredRequest for the WS subscription from the LIVE builder state
  // (query/variables/op-type), preserving {{env}}/{{secret}} tokens for Rust.
  const buildSubscriptionRequest = useCallback((): StoredRequest => {
    return {
      ...draft,
      graphql: {
        operation_type: "subscription",
        query: builder.query,
        variables_json: builder.variablesJson,
      },
    };
  }, [draft, builder.query, builder.variablesJson]);

  const onSubscribe = useCallback(() => {
    void stream.subscribe(buildSubscriptionRequest(), environmentId);
  }, [stream, buildSubscriptionRequest, environmentId]);

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
        subscribeButton={
          isSubscription ? (
            <SubscribeButton
              connState={stream.connState}
              disabled={runDisabled}
              onSubscribe={onSubscribe}
              onUnsubscribe={stream.unsubscribe}
            />
          ) : undefined
        }
        requestTypeToggle={requestTypeToggle}
        onSave={onSave}
        onCopyCurl={onCopyCurl}
        dirty={dirty}
      />

      <div
        className="gql-cols"
        style={
          {
            "--gql-tree-w": `${treeWidth}px`,
            "--gql-docs-w": `${docsWidth}px`,
          } as React.CSSProperties
        }
      >
        {schemaApi.schema && rootType ? (
          <FieldTree
            rootType={rootType}
            opType={builder.opType}
            availableOps={availableOps}
            rootFieldCounts={opCounts}
            onOpType={builder.setOpType}
            isSelected={builder.isSelected}
            onToggle={builder.toggleField}
            onPickRoot={builder.pickRootField}
            onFocusType={docsNav.focusType}
          />
        ) : (
          <div className="gql-col tree-col">
            <div className="col-head">{t("graphql.fieldsColumn")}</div>
            <div className="col-body lok-scroll">
              <EmptyState
                glow={schemaApi.state !== "introspecting"}
                headline={
                  schemaApi.state === "introspecting"
                    ? t("graphql.introspecting")
                    : t("graphql.noSchemaYet")
                }
                hint={t("graphql.noSchemaHint")}
                icon={<Icon name="i-graph" size={28} />}
                actionLabel={
                  schemaApi.state === "introspecting"
                    ? undefined
                    : t("graphql.refreshSchema")
                }
                onAction={() => void schemaApi.refresh()}
              />
            </div>
          </div>
        )}

        <ResizeHandle
          axis="x"
          value={treeWidth}
          toValue={(start, delta) => start + delta}
          onChange={setTreeWidth}
          onReset={resetTreeWidth}
          ariaLabel={t("common.resizeColumn")}
        />

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

        <ResizeHandle
          axis="x"
          value={docsWidth}
          toValue={(start, delta) => start - delta}
          onChange={setDocsWidth}
          onReset={resetDocsWidth}
          ariaLabel={t("common.resizeColumn")}
        />

        {schemaApi.schema ? (
          <DocsExplorer schema={schemaApi.schema} nav={docsNav} />
        ) : (
          <div className="gql-col docs-col">
            <div className="col-head">{t("graphql.docsColumn")}</div>
            <div className="col-body lok-scroll">
              {/* Secondary rail: one hero per screen — the schema CTA on the
                  left owns it, so this stays compact and quiet. */}
              <EmptyState
                compact
                headline={t("graphql.docsAppearHeadline")}
                hint={t("graphql.docsAppearHint")}
                icon={<Icon name="i-book" size={18} />}
              />
            </div>
          </div>
        )}
      </div>

      {isSubscription && <SubscriptionStream stream={stream} />}

      {/* Meta strip only once it carries real information — with no schema it
          was three stacked bars of noise under an empty screen. */}
      {schemaApi.schema != null && (
        <ExplorerStatusBar
          schemaState={schemaApi.state}
          typeCount={schemaApi.typeCount}
          selectedFieldCount={builder.selection.size}
          lastRefreshLabel={relativeTimeLabel(schemaApi.lastRefreshedAt)}
        />
      )}
    </div>
  );
}
