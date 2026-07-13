import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useT } from "../../../i18n/useT";
import { useNodeStatus } from "../../../hooks/useNodeStatus";
import type { WorkflowRFNode } from "../../../lib/workflowGraph";
import { StatusRing } from "./StatusRing";

/** Custom node for a RequestNode: method badge + name/ref + run status ring.
 *  Two handles (target in, source out) wire it into the sequential chain. */
export function RequestNodeCard({ id, data }: NodeProps<WorkflowRFNode>) {
  const t = useT();
  const status = useNodeStatus(id);
  const node = data.node;
  if (node.kind !== "request") return null;

  const isRef = "request_ref" in node;
  const label = isRef ? node.request_ref : node.request.name;
  // A node is "unconfigured" when a saved ref is empty or an inline request has
  // no URL — surface it on the card so a broken step is visible before a run.
  const invalid = isRef
    ? node.request_ref.trim() === ""
    : node.request.url.trim() === "";

  return (
    <div
      className="lok-wf-node"
      role="group"
      aria-label={`${t("workflow.nodeRequest")}: ${label || t("workflow.requestRefPlaceholder")}`}
      tabIndex={0}
      data-status={status}
      data-invalid={invalid || undefined}
    >
      <Handle type="target" position={Position.Left} />
      <div className="lok-wf-node__head">
        <span className="lok-wf-node__badge" data-kind="request">
          {t("workflow.nodeRequest")}
        </span>
        <StatusRing status={status} />
      </div>
      <div className="lok-wf-node__title">
        {label || t("workflow.requestRefPlaceholder")}
      </div>
      {invalid && (
        <div className="lok-wf-node__warn" title={t("workflow.nodeNotConfigured")}>
          {t("workflow.nodeNotConfigured")}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
