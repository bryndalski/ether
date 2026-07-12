import { useCallback, useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useEnvStore } from "../../state/useEnvStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { useRequestDraft } from "../../hooks/useRequestDraft";
import { useSendRequest } from "../../hooks/useSendRequest";
import { EmptyState } from "../common/EmptyState";
import { ResponseDock } from "../response/ResponseDock";
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
  const activeEnvironmentId = useEnvStore((state) => state.activeEnvironmentId);
  const newRequest = useNewRequest();

  const { draft, dispatch, counts } = useRequestDraft(activeRequest);
  const { sendState, send, cancel } = useSendRequest();
  const [tab, setTab] = useState<RequestTabKey>("Params");

  const onSend = useCallback(() => {
    if (draft.url.trim() === "") return;
    void send(draft, activeEnvironmentId);
  }, [draft, activeEnvironmentId, send]);

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
      />
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
      <ResponseDock sendState={sendState} />
    </section>
  );
}
