import type { OperationType } from "../../lib/graphqlSelection";
import type { SchemaState } from "../../hooks/useGraphqlSchema";
import type { SendState } from "../../hooks/useSendRequest";
import { OperationPicker } from "./OperationPicker";
import { UrlInput } from "../workbench/UrlInput";
import { RefreshSchemaButton } from "./RefreshSchemaButton";
import { RunButton } from "./RunButton";

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
}

/** The 44px toolbar: operation picker + endpoint URL + refresh schema + Run. */
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
}: ExplorerToolbarProps) {
  return (
    <div className="toolbar">
      <OperationPicker opType={opType} available={availableOps} onChange={onOpType} />
      <UrlInput url={url} onChange={onUrl} onEnter={onRun} />
      <RefreshSchemaButton state={schemaState} onRefresh={onRefresh} />
      <RunButton
        sendState={sendState}
        disabled={runDisabled}
        onRun={onRun}
        onCancel={onCancel}
      />
    </div>
  );
}
