import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useT } from "../../../i18n/useT";

/** A labeled edge for a workflow chain. On a Condition arm it shows a true/false
 *  label (success hue for true, neutral for false); plain sequential edges render
 *  unlabeled. `branch` travels in the edge `data` from the graph adapter. */
export function BranchEdge(props: EdgeProps) {
  const t = useT();
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const branch =
    props.data && typeof props.data === "object" && "branch" in props.data
      ? (props.data as { branch?: boolean }).branch
      : undefined;

  return (
    <>
      <BaseEdge id={props.id} path={path} />
      {branch !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="lok-wf-edge-label"
            data-branch={branch ? "true" : "false"}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {branch ? t("workflow.handleTrue") : t("workflow.handleFalse")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
