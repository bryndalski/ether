// Pure factory for new workflow nodes dropped from the palette. Kept out of the
// hook so node defaults are one place and unit-testable. Ids are generated with
// the shared id helper so they never collide with a StoredRequest id.

import { makeId } from "./ids";
import type { NodePosition, WorkflowNode, WorkflowNodeKind } from "./workflow";

/** Create a new node of `kind` at `position` with sensible v1 defaults. A request
 *  node starts as an empty reference the inspector then fills in. */
export function createNode(
  kind: WorkflowNodeKind,
  position: NodePosition,
): WorkflowNode {
  const id = makeId("wf-node");
  switch (kind) {
    case "request":
      return { kind: "request", id, request_ref: "", position };
    case "extract":
      return { kind: "extract", id, source: "$.", var_name: "", position };
    case "condition":
      return {
        kind: "condition",
        id,
        expr: { type: "status_equals", expected: 200 },
        position,
      };
    case "delay":
      return { kind: "delay", id, ms: 500, position };
  }
}

/** The palette's node kinds, in display order. */
export const PALETTE_KINDS: readonly WorkflowNodeKind[] = [
  "request",
  "extract",
  "condition",
  "delay",
];
