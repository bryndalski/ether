import type { ReactNode } from "react";
import type { OperationType } from "../../lib/graphqlSelection";
import type { SchemaState } from "../../hooks/useGraphqlSchema";
import type { SendState } from "../../hooks/useSendRequest";
import { OperationPicker } from "./OperationPicker";
import { UrlInput } from "../workbench/UrlInput";
import { RefreshSchemaButton } from "./RefreshSchemaButton";
import { RunButton } from "./RunButton";
import { Icon } from "../common/Icon";

interface ExplorerToolbarProps {
  opType: OperationType;
  availableOps: OperationType[];
  onOpType: (opType: OperationType) => void;
  url: string;
  onUrl: (url: string) => void;
  schemaState: SchemaState;
  onRefresh: () => void;
  sendState: SendState;
  runDisabled: boolean;
  onRun: () => void;
  onCancel: () => void;
  // When the operation is a subscription the toolbar shows this
  // Subscribe/Unsubscribe control instead of RunButton (query/mutation path is
  // untouched). Exactly one of {RunButton, subscribeButton} renders.
  subscribeButton?: ReactNode;
  // Shared workbench controls, injected in GraphQL mode so there is exactly
  // one toolbar (no duplicate RequestBar). See blueprint §4.b Option A.
  requestTypeToggle?: ReactNode;
  onSave?: () => void;
  onCopyCurl?: () => void;
  dirty?: boolean;
}

/** The single 44px GraphQL toolbar: request-type toggle + operation picker +
 *  endpoint URL + refresh schema + Save + Copy cURL + Run. The REST RequestBar
 *  is not rendered in GraphQL mode, so this is the only toolbar/URL/Run. */
export function ExplorerToolbar({
  opType,
  availableOps,
  onOpType,
  url,
  onUrl,
  schemaState,
  onRefresh,
  sendState,
  runDisabled,
  onRun,
  onCancel,
  subscribeButton,
  requestTypeToggle,
  onSave,
  onCopyCurl,
  dirty,
}: ExplorerToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Pasek GraphQL">
      {requestTypeToggle}
      <OperationPicker opType={opType} available={availableOps} onChange={onOpType} />
      <UrlInput url={url} onChange={onUrl} onEnter={onRun} />
      <RefreshSchemaButton state={schemaState} onRefresh={onRefresh} />
      {onSave && (
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
      )}
      {onCopyCurl && (
        <button
          type="button"
          className="btn-save"
          aria-label="Kopiuj jako cURL"
          title="Kopiuj jako cURL (⌘⇧C)"
          disabled={url.trim() === ""}
          onClick={onCopyCurl}
        >
          <Icon name="i-copy" size={15} />
        </button>
      )}
      {subscribeButton ?? (
        <RunButton
          sendState={sendState}
          disabled={runDisabled}
          onRun={onRun}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
