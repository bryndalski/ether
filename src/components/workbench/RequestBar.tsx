import type { SendState } from "../../hooks/useSendRequest";
import type { RequestDraft } from "../../hooks/useRequestDraft";
import { MethodSelect } from "./MethodSelect";
import { UrlInput } from "./UrlInput";
import { SendButton } from "./SendButton";

interface RequestBarProps {
  draft: RequestDraft;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  sendState: SendState;
  onSend: () => void;
  onCancel: () => void;
}

/** The 44px toolbar row: method select + URL field + Send. */
export function RequestBar({
  draft,
  onMethodChange,
  onUrlChange,
  sendState,
  onSend,
  onCancel,
}: RequestBarProps) {
  return (
    <div className="toolbar">
      <MethodSelect method={draft.method} onChange={onMethodChange} />
      <UrlInput url={draft.url} onChange={onUrlChange} onEnter={onSend} />
      <SendButton
        sendState={sendState}
        disabled={draft.url.trim() === ""}
        onSend={onSend}
        onCancel={onCancel}
      />
    </div>
  );
}
