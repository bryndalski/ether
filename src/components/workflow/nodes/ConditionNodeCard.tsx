import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useT } from "../../../i18n/useT";
import { useNodeStatus } from "../../../hooks/useNodeStatus";
import type { WorkflowRFNode } from "../../../lib/workflowGraph";
import type { ConditionExpr } from "../../../lib/workflow";
import { StatusRing } from "./StatusRing";

/** A one-line human summary of a condition predicate. */
function summarize(expr: ConditionExpr): string {
  switch (expr.type) {
    case "status_equals":
      return `status == ${expr.expected}`;
    case "status_in_range":
      return `status ∈ [${expr.min}, ${expr.max}]`;
    case "json_path_exists":
      return `${expr.path} exists`;
    case "json_path_equals":
      return `${expr.path} == ${expr.expected}`;
  }
}

/** Custom node for a ConditionNode: predicate summary + TWO labeled source
 *  handles (true / false) that map to the branch edges. */
export function ConditionNodeCard({ id, data }: NodeProps<WorkflowRFNode>) {
  const t = useT();
  const status = useNodeStatus(id);
  const node = data.node;
  if (node.kind !== "condition") return null;

  return (
    <div
      className="lok-wf-node lok-wf-node--condition"
      role="group"
      aria-label={`${t("workflow.nodeCondition")}: ${summarize(node.expr)}`}
      tabIndex={0}
      data-status={status}
    >
      <Handle type="target" position={Position.Left} />
      <div className="lok-wf-node__head">
        <span className="lok-wf-node__badge" data-kind="condition">
          {t("workflow.nodeCondition")}
        </span>
        <StatusRing status={status} />
      </div>
      <div className="lok-wf-node__title">{summarize(node.expr)}</div>
      <div className="lok-wf-node__handles">
        <span className="lok-wf-node__handle-label" data-branch="true">
          {t("workflow.handleTrue")}
        </span>
        <span className="lok-wf-node__handle-label" data-branch="false">
          {t("workflow.handleFalse")}
        </span>
      </div>
      <Handle
        type="source"
        id="true"
        position={Position.Right}
        style={{ top: "38%" }}
        aria-label={t("workflow.handleTrue")}
      />
      <Handle
        type="source"
        id="false"
        position={Position.Right}
        style={{ top: "72%" }}
        aria-label={t("workflow.handleFalse")}
      />
    </div>
  );
}
