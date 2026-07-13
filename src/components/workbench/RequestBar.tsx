import type { ReactNode } from "react";
import type { SendState } from "../../hooks/useSendRequest";
import type { RequestDraft } from "../../hooks/useRequestDraft";
import { MethodSelect } from "./MethodSelect";
import { UrlInput } from "./UrlInput";
import { SendButton } from "./SendButton";
import { BenchmarkButton } from "../devtools/BenchmarkButton";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface RequestBarProps {
  draft: RequestDraft;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  sendState: SendState;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  onBenchmark: () => void;
  onCopyCurl: () => void;
  dirty: boolean;
  requestTypeToggle?: ReactNode;
}

/** The toolbar row (--lok-toolbar-h): request-type toggle + method select + URL + Save + Send.
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
  onCopyCurl,
  dirty,
  requestTypeToggle,
}: RequestBarProps) {
  const t = useT();
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
