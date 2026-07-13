// Reads one node's live run status from the workflow-run context, so a custom
// node card (rendered by React Flow, outside the editor's hook tree) can light up
// idle→running→ok/fail without prop-drilling.

import { useContext } from "react";
import { WorkflowRunContext } from "../components/workflow/WorkflowRunContext";
import type { NodeRunStatus } from "../lib/workflow";

export function useNodeStatus(nodeId: string): NodeRunStatus {
  const { statuses } = useContext(WorkflowRunContext);
  return statuses[nodeId] ?? "idle";
}
