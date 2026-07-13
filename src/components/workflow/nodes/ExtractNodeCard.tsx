import { useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useT } from "../../../i18n/useT";
import { useNodeStatus } from "../../../hooks/useNodeStatus";
import { WorkflowRunContext } from "../WorkflowRunContext";
import type { WorkflowRFNode } from "../../../lib/workflowGraph";
import { StatusRing } from "./StatusRing";

/** Custom node for an ExtractNode: JSONPath → variable, showing the extracted
 *  value once the run binds it. */
export function ExtractNodeCard({ id, data }: NodeProps<WorkflowRFNode>) {
  const t = useT();
  const status = useNodeStatus(id);
  const { extracted } = useContext(WorkflowRunContext);
  const node = data.node;
  if (node.kind !== "extract") return null;

  const value = node.var_name ? extracted[node.var_name] : undefined;

  return (
    <div
      className="lok-wf-node"
      role="group"
      aria-label={`${t("workflow.nodeExtract")}: ${node.var_name || node.source}`}
      tabIndex={0}
      data-status={status}
    >
      <Handle type="target" position={Position.Left} />
      <div className="lok-wf-node__head">
        <span className="lok-wf-node__badge" data-kind="extract">
          {t("workflow.nodeExtract")}
        </span>
        <StatusRing status={status} />
      </div>
      <div className="lok-wf-node__title">
        <code>{node.source}</code> → {node.var_name || "?"}
      </div>
      {value !== undefined && (
        <div className="lok-wf-node__extracted">
          {t("workflow.extractedValue", { value: String(value) })}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
