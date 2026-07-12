import { useCallback, useEffect, useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import { useHistoryStore } from "../../state/useHistoryStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { useRequestDraft } from "../../hooks/useRequestDraft";
import { useSendRequest } from "../../hooks/useSendRequest";
import { useHistoryReplay } from "../../hooks/useHistoryReplay";
import { isRequestDirty } from "../../lib/dirty";
import { buildOperationRequest } from "../../lib/graphqlBody";
import { hasRedactedSecrets } from "../../lib/replay";
import type { StoredRequest } from "../../lib/types";
import { RequestTypeToggle } from "../graphql/RequestTypeToggle";
import { EmptyState } from "../common/EmptyState";
import { ResponseDock } from "../response/ResponseDock";
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
  const saveRequest = useCollectionsStore((state) => state.saveRequest);
  const newRequest = useNewRequest();

  const { draft, dispatch, counts } = useRequestDraft(activeRequest);
  const { sendState, send, cancel } = useSendRequest();
  const [tab, setTab] = useState<RequestTabKey>("Params");

  const refreshHistory = useHistoryStore((state) => state.refresh);
  const openedId = useHistoryStore((state) => state.openedId);
  const snapshotEntry = useHistoryStore((state) =>
    openedId ? state.entryById(openedId) : null,
  );

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

  const onRequestType = useCallback(
    (graphql: boolean) => {
      if (graphql) dispatch({ kind: "setGraphql", graphql: {} });
      else dispatch({ kind: "clearGraphql" });
    },
    [dispatch],
  );

  if (!activeRequest) {
    return (
      <section className="editor" aria-label="Edytor requestu">
        <EmptyState
          headline="Wklej curl albo zacznij od GET"
          hint="Wybierz request z kolekcji lub utwórz nowy, by zacząć."
          actionLabel="Nowy request"
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
      aria-label="Edytor requestu"
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
      <RequestBar
        draft={draft}
        onMethodChange={(method) => dispatch({ kind: "setMethod", method })}
        onUrlChange={(url) => dispatch({ kind: "setUrl", url })}
        sendState={sendState}
        onSend={onSend}
        onCancel={cancel}
        onSave={onSave}
        dirty={dirty}
        requestTypeToggle={
          <RequestTypeToggle isGraphql={isGraphql} onSelect={onRequestType} />
        }
      />
      {sendBlocked && holes.length > 0 && (
        <ReplayReconcileBanner holes={holes} onDismiss={dismiss} />
      )}
      {isGraphql ? (
        <GraphqlExplorer
          draft={draft}
          dispatch={dispatch}
          sendState={sendState}
          onRun={onSend}
          onCancel={cancel}
        />
      ) : (
        <>
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
      />
      <HistoryDrawer activeRequestId={activeRequestId} onReplay={onReplay} />
    </section>
  );
}
