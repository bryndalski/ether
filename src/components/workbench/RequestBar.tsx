import type { ReactNode } from "react";
import type { SendState } from "../../hooks/useSendRequest";
import type { RequestDraft } from "../../hooks/useRequestDraft";
import { MethodSelect } from "./MethodSelect";
import { UrlInput } from "./UrlInput";
import { SendButton } from "./SendButton";
import { BenchmarkButton } from "../devtools/BenchmarkButton";
import { Icon } from "../common/Icon";

interface RequestBarProps {
  draft: RequestDraft;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  sendState: SendState;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  onBenchmark: () => void;
  dirty: boolean;
  requestTypeToggle?: ReactNode;
}

/** The 44px toolbar row: request-type toggle + method select + URL + Save + Send.
 *  For GraphQL the method select is hidden (GraphQL is always POST). */
export function RequestBar({
  draft,
  onMethodChange,
  onUrlChange,
  sendState,
  onSend,
  onCancel,
  onSave,
  onBenchmark,
  dirty,
  requestTypeToggle,
}: RequestBarProps) {
  const isGraphql = draft.graphql != null;
  const inFlight =
    sendState.phase === "in-flight" || sendState.phase === "interpolating";
  return (
    <div className="toolbar">
      {requestTypeToggle}
      {!isGraphql && (
        <MethodSelect method={draft.method} onChange={onMethodChange} />
      )}
      <UrlInput url={draft.url} onChange={onUrlChange} onEnter={onSend} />
      <button
        type="button"
        className="btn-save"
        aria-label="Zapisz request"
        title="Zapisz request (⌘S)"
        disabled={!dirty}
        onClick={onSave}
      >
        <Icon name="i-save" size={15} />
      </button>
      <BenchmarkButton
        disabled={draft.url.trim() === "" || inFlight}
        onClick={onBenchmark}
      />
      <SendButton
        sendState={sendState}
        disabled={draft.url.trim() === ""}
        onSend={onSend}
        onCancel={onCancel}
      />
    </div>
  );
}
