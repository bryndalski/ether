import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useT } from "../../../i18n/useT";
import { useNodeStatus } from "../../../hooks/useNodeStatus";
import type { WorkflowRFNode } from "../../../lib/workflowGraph";
import { StatusRing } from "./StatusRing";

/** Custom node for a DelayNode: "wait {ms}ms". */
export function DelayNodeCard({ id, data }: NodeProps<WorkflowRFNode>) {
  const t = useT();
  const status = useNodeStatus(id);
  const node = data.node;
  if (node.kind !== "delay") return null;

  return (
    <div
      className="lok-wf-node"
      role="group"
      aria-label={`${t("workflow.nodeDelay")}: ${node.ms}ms`}
      tabIndex={0}
      data-status={status}
    >
      <Handle type="target" position={Position.Left} />
      <div className="lok-wf-node__head">
        <span className="lok-wf-node__badge" data-kind="delay">
          {t("workflow.nodeDelay")}
        </span>
        <StatusRing status={status} />
      </div>
      <div className="lok-wf-node__title">{node.ms} ms</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
