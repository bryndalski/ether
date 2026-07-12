import type { SendState } from "../../hooks/useSendRequest";
import type { RequestDraft } from "../../hooks/useRequestDraft";
import { MethodSelect } from "./MethodSelect";
import { UrlInput } from "./UrlInput";
import { SendButton } from "./SendButton";
import { Icon } from "../common/Icon";

interface RequestBarProps {
  draft: RequestDraft;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  sendState: SendState;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  dirty: boolean;
}

/** The 44px toolbar row: method select + URL field + Save + Send. */
export function RequestBar({
  draft,
  onMethodChange,
  onUrlChange,
  sendState,
  onSend,
  onCancel,
  onSave,
  dirty,
}: RequestBarProps) {
  return (
    <div className="toolbar">
      <MethodSelect method={draft.method} onChange={onMethodChange} />
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
      <SendButton
        sendState={sendState}
        disabled={draft.url.trim() === ""}
        onSend={onSend}
        onCancel={onCancel}
      />
    </div>
  );
}
