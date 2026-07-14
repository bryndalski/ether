import type { ReactNode } from "react";
import type { SendState } from "../../hooks/useSendRequest";
import type { RequestDraft } from "../../hooks/useRequestDraft";
import { UrlInput } from "./UrlInput";
import { SendButton } from "./SendButton";
import { BenchmarkButton } from "../devtools/BenchmarkButton";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface RequestBarProps {
  draft: RequestDraft;
  onUrlChange: (url: string) => void;
  sendState: SendState;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  onBenchmark: () => void;
  onCopyCurl: () => void;
  dirty: boolean;
  /** The unified request-kind picker (HTTP verb / GraphQL op) — owns what used
   *  to be the REST|GraphQL toggle + method dropdown pair. */
  requestTypeToggle?: ReactNode;
}

/** The toolbar row (--lok-toolbar-h): kind picker + URL + Save + Send. */
export function RequestBar({
  draft,
  onUrlChange,
  sendState,
  onSend,
  onCancel,
  onSave,
  onBenchmark,
  onCopyCurl,
  dirty,
  requestTypeToggle,
}: RequestBarProps) {
  const t = useT();
  const inFlight =
    sendState.phase === "in-flight" || sendState.phase === "interpolating";
  return (
    <div className="toolbar" data-inflight={inFlight}>
      {requestTypeToggle}
      <UrlInput url={draft.url} onChange={onUrlChange} onEnter={onSend} />
      <button
        type="button"
        className="lok-btn lok-btn--md lok-btn--neutral lok-btn--icon btn-save lok-tip"
        aria-label={t("palette.saveRequest")}
        data-tip={t("workbench.saveRequestTitle")}
        disabled={!dirty}
        onClick={onSave}
      >
        <Icon name="i-save" size={17} />
      </button>
      <button
        type="button"
        className="lok-btn lok-btn--md lok-btn--neutral lok-btn--icon btn-save lok-tip"
        aria-label={t("workbench.copyAsCurlAria")}
        data-tip={t("workbench.copyAsCurl")}
        disabled={draft.url.trim() === ""}
        onClick={onCopyCurl}
      >
        <Icon name="i-copy" size={17} />
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
