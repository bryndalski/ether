import { createContext } from "react";
import type { NodeRunStatus } from "../../lib/workflow";

/** Per-node run status + extracted values, shared with custom node cards (which
 *  React Flow renders outside the editor's hook tree). Defaults are inert so a
 *  card renders "idle" when no run is active. */
export interface WorkflowRunContextValue {
  statuses: Record<string, NodeRunStatus>;
  extracted: Record<string, unknown>;
}

export const WorkflowRunContext = createContext<WorkflowRunContextValue>({
  statuses: {},
  extracted: {},
});
