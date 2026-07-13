import { useCallback, useEffect, useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import { useHistoryStore } from "../../state/useHistoryStore";
import { useSnapshotStore } from "../../state/useSnapshotStore";
import { useWorkbenchActions } from "../../state/useWorkbenchActions";
import { useCopyAsCurl } from "../../hooks/useCopyAsCurl";
import { useNewRequest } from "../../hooks/useNewRequest";
import { useT } from "../../i18n/useT";
import { useRequestDraft } from "../../hooks/useRequestDraft";
import { useSendRequest } from "../../hooks/useSendRequest";
import { useWatchMode } from "../../hooks/useWatchMode";
import { resolveAndSend } from "../../lib/ipc";
import { useBenchmark, type BenchConfig } from "../../hooks/useBenchmark";
import { useHistoryReplay } from "../../hooks/useHistoryReplay";
import { isRequestDirty } from "../../lib/dirty";
import { buildOperationRequest } from "../../lib/graphqlBody";
import { hasRedactedSecrets } from "../../lib/replay";
import type { ScrubConfig, StoredRequest } from "../../lib/types";
import { TestsPanel } from "./tests/TestsPanel";
import { ScriptsPanel } from "./scripts/ScriptsPanel";
import { RequestTypeToggle } from "../graphql/RequestTypeToggle";
import { EmptyState } from "../common/EmptyState";
import { ResponseDock } from "../response/ResponseDock";
import { DevToolsDrawer } from "../devtools/DevToolsDrawer";
import { HistoryDrawer } from "../history/HistoryDrawer";
import { ReplayReconcileBanner } from "../history/ReplayReconcileBanner";
import { GraphqlExplorer } from "../graphql/GraphqlExplorer";
import { RequestBar } from "./RequestBar";
import { RequestTabs, type RequestTabKey } from "./RequestTabs";
import { ParamsPanel } from "./ParamsPanel";
import { HeadersPanel } from "./HeadersPanel";
import { BodyPanel } from "./BodyPanel";
import { AuthPanel } from "./AuthPanel";
import { CurlTab } from "./CurlTab";

/** Zone 2 + 3 orchestrator. Owns the live draft and the send lifecycle; lays
 *  out the toolbar → tabs → active panel, with the response dock docked below
 *  (mirroring the mock, where .response lives inside .editor). */
export function RequestWorkbench() {
  const activeRequest = useCollectionsStore((state) => state.activeRequest());
  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  const activeEnvironmentId = useEnvStore((state) => state.activeEnvironmentId);
  const activeKind = useEnvStore((state) => state.activeKind);
  const saveRequest = useCollectionsStore((state) => state.saveRequest);
  const newRequest = useNewRequest();
  const t = useT();

  const { draft, dispatch, counts } = useRequestDraft(activeRequest);
  const { sendState, send, cancel } = useSendRequest();
  const {
    benchState,
    run: runBenchmark,
    cancel: cancelBenchmark,
    selectSample,
    reset: resetBenchmark,
  } = useBenchmark();
  const [tab, setTab] = useState<RequestTabKey>("Params");

  const refreshHistory = useHistoryStore((state) => state.refresh);
  const openedId = useHistoryStore((state) => state.openedId);
  const snapshotEntry = useHistoryStore((state) =>
    openedId ? state.entryById(openedId) : null,
  );

  // Snapshot baseline for the active request + the editable scrub config.
  const snapshotRecord = useSnapshotStore((state) => state.record);
  const loadSnapshot = useSnapshotStore((state) => state.load);
  const saveSnapshotStore = useSnapshotStore((state) => state.save);
  const removeSnapshot = useSnapshotStore((state) => state.remove);
  const resetSnapshot = useSnapshotStore((state) => state.reset);
  const [scrubConfig, setScrubConfig] = useState<ScrubConfig>({
    paths: [],
    auto_timestamps: true,
    auto_uuids: true,
  });

  useEffect(() => {
    if (activeRequestId) void loadSnapshot(activeRequestId);
    else resetSnapshot();
  }, [activeRequestId, loadSnapshot, resetSnapshot]);

  // Adopt a saved snapshot's scrub config when one loads for this request.
  useEffect(() => {
    if (snapshotRecord) setScrubConfig(snapshotRecord.scrub_config);
  }, [snapshotRecord]);

  // Watch-mode runs the same real resolve_and_send path (no mocks, live endpoint).
  const watch = useWatchMode({
    draft,
    environmentId: activeEnvironmentId,
    send: (outgoing, env) => resolveAndSend(buildOperationRequest(outgoing), env),
    assertions: draft.assertions,
    snapshotConfig: snapshotRecord?.scrub_config ?? scrubConfig,
    baseline: snapshotRecord?.baseline ?? null,
  });

  const onSaveSnapshot = useCallback(() => {
    if (activeRequestId && sendState.response) {
      void saveSnapshotStore(activeRequestId, sendState.response, scrubConfig);
    }
  }, [activeRequestId, sendState.response, scrubConfig, saveSnapshotStore]);

  const onDeleteSnapshot = useCallback(() => {
    if (activeRequestId) void removeSnapshot(activeRequestId);
  }, [activeRequestId, removeSnapshot]);

  const dirty = isRequestDirty(draft, activeRequest);
  const isGraphql = draft.graphql != null;

  // A ••• redacted secret must never leave as a real credential.
  const sendBlocked = hasRedactedSecrets(draft);

  const onSend = useCallback(() => {
    if (draft.url.trim() === "") return;
    if (hasRedactedSecrets(draft)) return; // hard secret-leak gate
    // For GraphQL, build the {query,variables} POST body (leaving {{env.x}}
    // tokens intact) and send through the exact same resolve_and_send path.
    const outgoing = buildOperationRequest(draft);
    void send(outgoing, activeEnvironmentId);
  }, [draft, activeEnvironmentId, send]);

  // The Benchmark button never auto-runs the loop: it fires one normal send so
  // the ResponseDock (and its warned Bench-tab launcher) appears, and resets any
  // prior benchmark state. The explicit "Uruchom benchmark" starts the loop.
  const onBenchmark = useCallback(() => {
    if (draft.url.trim() === "") return;
    if (hasRedactedSecrets(draft)) return;
    resetBenchmark();
    onSend();
  }, [draft, resetBenchmark, onSend]);

  const onRunBenchmark = useCallback(
    (config: BenchConfig) => {
      const outgoing = buildOperationRequest(draft);
      void runBenchmark(outgoing, activeEnvironmentId, config);
    },
    [draft, activeEnvironmentId, runBenchmark],
  );

  const requestHost = (() => {
    try {
      return new URL(draft.url).host;
    } catch {
      return draft.url;
    }
  })();

  // Refresh the history feed once a send settles, so a new row appears.
  useEffect(() => {
    if (sendState.phase === "success" || sendState.phase === "error") {
      void refreshHistory(activeRequestId);
    }
  }, [sendState.phase, activeRequestId, refreshHistory]);

  const sendDraft = useCallback(
    (outgoing: StoredRequest) => {
      if (hasRedactedSecrets(outgoing)) return;
      void send(buildOperationRequest(outgoing), activeEnvironmentId);
    },
    [send, activeEnvironmentId],
  );

  const { holes, replay, dismiss } = useHistoryReplay({
    dispatch,
    sendDraft,
    draft,
  });

  const onReplay = useCallback(
    (id: string) => {
      const entry = useHistoryStore.getState().entryById(id);
      if (entry) replay(entry);
    },
    [replay],
  );

  const onSave = useCallback(() => {
    void saveRequest(draft);
  }, [draft, saveRequest]);

  const copyAsCurl = useCopyAsCurl(draft, activeEnvironmentId);
  const onCopyCurl = useCallback(() => void copyAsCurl(), [copyAsCurl]);

  // Register the live draft's actions on the imperative bus so the shell-level
  // ⌘K palette and the global ⌘⇧C hotkey drive the exact same closures.
  const canSend = draft.url.trim() !== "" && !sendBlocked;
  const registerBus = useWorkbenchActions((state) => state.register);
  const resetBus = useWorkbenchActions((state) => state.reset);
  useEffect(() => {
    registerBus({
      save: onSave,
      send: onSend,
      benchmark: onBenchmark,
      copyCurl: onCopyCurl,
      importSpec: (spec) => dispatch({ kind: "importSpec", spec }),
      canSave: dirty,
      canSend,
    });
    return () => resetBus();
  }, [
    onSave,
    onSend,
    onBenchmark,
    onCopyCurl,
    dispatch,
    dirty,
    canSend,
    registerBus,
    resetBus,
  ]);

  const onRequestType = useCallback(
    (graphql: boolean) => {
      if (graphql) dispatch({ kind: "setGraphql", graphql: {} });
      else dispatch({ kind: "clearGraphql" });
    },
    [dispatch],
  );

  if (!activeRequest) {
    return (
      <section className="editor" aria-label={t("workbench.editorAria")}>
        <EmptyState
          glow
          headline={t("workbench.emptyHeadline")}
          hint={t("workbench.emptyHint")}
          actionLabel={t("palette.newRequest")}
          shortcut="⌘N"
          onAction={newRequest}
          icon="~"
        />
        <HistoryDrawer activeRequestId={activeRequestId} onReplay={onReplay} />
      </section>
    );
  }

  return (
    <section
      className="editor"
      aria-label={t("workbench.editorAria")}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSend();
        } else if (
          event.key.toLowerCase() === "s" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          onSave();
        }
      }}
    >
      {isGraphql ? (
        <GraphqlExplorer
          draft={draft}
          dispatch={dispatch}
          sendState={sendState}
          onRun={onSend}
          onCancel={cancel}
          environmentId={activeEnvironmentId}
          requestTypeToggle={
            <RequestTypeToggle isGraphql={isGraphql} onSelect={onRequestType} />
          }
          onSave={onSave}
          onCopyCurl={onCopyCurl}
          dirty={dirty}
        />
      ) : (
        <>
          <RequestBar
            draft={draft}
            onMethodChange={(method) => dispatch({ kind: "setMethod", method })}
            onUrlChange={(url) => dispatch({ kind: "setUrl", url })}
            sendState={sendState}
            onSend={onSend}
            onCancel={cancel}
            onSave={onSave}
            onBenchmark={onBenchmark}
            onCopyCurl={onCopyCurl}
            dirty={dirty}
            requestTypeToggle={
              <RequestTypeToggle isGraphql={isGraphql} onSelect={onRequestType} />
            }
          />
          {sendBlocked && holes.length > 0 && (
            <ReplayReconcileBanner holes={holes} onDismiss={dismiss} />
          )}
          <RequestTabs active={tab} onSelect={setTab} counts={counts} />
          {tab === "Params" && (
            <ParamsPanel
              params={draft.query_params}
              onChange={(params) => dispatch({ kind: "setParams", params })}
            />
          )}
          {tab === "Headers" && (
            <HeadersPanel
              headers={draft.headers}
              onChange={(headers) => dispatch({ kind: "setHeaders", headers })}
            />
          )}
          {tab === "Body" && (
            <BodyPanel
              body={draft.body}
              onChange={(body) => dispatch({ kind: "setBody", body })}
            />
          )}
          {tab === "Auth" && (
            <AuthPanel
              auth={draft.auth}
              onChange={(auth) => dispatch({ kind: "setAuth", auth })}
            />
          )}
          {tab === "Tests" && (
            <TestsPanel
              assertions={draft.assertions}
              onAssertionsChange={(assertions) =>
                dispatch({ kind: "setAssertions", assertions })
              }
              scrubConfig={scrubConfig}
              onScrubConfigChange={setScrubConfig}
            />
          )}
          {tab === "Scripts" && (
            <ScriptsPanel
              draft={draft}
              environmentId={activeEnvironmentId}
              lastResponse={sendState.response}
              sendOutcomes={{ pre: null, post: null }}
              onPreScriptChange={(script) =>
                dispatch({ kind: "setPreScript", script })
              }
              onPostScriptChange={(script) =>
                dispatch({ kind: "setPostScript", script })
              }
            />
          )}
          {tab === "cURL" && (
            <CurlTab
              draft={draft}
              environmentId={activeEnvironmentId}
              onImport={(spec) => dispatch({ kind: "importSpec", spec })}
            />
          )}
        </>
      )}
      <ResponseDock
        sendState={sendState}
        snapshot={
          snapshotEntry
            ? {
                response: snapshotEntry.response,
                source: "history",
                executedAt: snapshotEntry.executed_at,
              }
            : null
        }
        devTools={{
          benchState,
          host: requestHost,
          isProd: activeKind() === "prod",
          hasRedactedSecrets: sendBlocked,
          insecure: draft.options.insecure,
          onRunBenchmark,
          onCancelBenchmark: cancelBenchmark,
          onSelectSample: selectSample,
        }}
        testing={{
          assertions: draft.assertions,
          snapshotRecord,
          scrubConfig,
          watch,
          onSaveSnapshot,
          onAcceptSnapshot: onSaveSnapshot,
          onDeleteSnapshot,
        }}
      />
      <HistoryDrawer activeRequestId={activeRequestId} onReplay={onReplay} />
      <DevToolsDrawer />
    </section>
  );
}
