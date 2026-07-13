// Pure adapter between the persisted `Workflow` graph and React Flow's node/edge
// shape. Kept side-effect-free so the whole serialize/deserialize is unit-testable
// without a DOM. React Flow needs `{ id, type, position, data }` per node and
// `{ id, source, target, sourceHandle? }` per edge; our `WorkflowEdge.from/to` map
// to `source/target`, and a Condition arm's `branch` maps to a `sourceHandle`
// ("true"/"false") on the Condition node's two source handles.

import type { Edge, Node } from "@xyflow/react";
import type { Workflow, WorkflowEdge, WorkflowNode } from "./workflow";

/** The React Flow node `data` payload — the whole domain node travels inside it so
 *  a custom node component reads exactly what the store holds. */
export interface RFNodeData extends Record<string, unknown> {
  node: WorkflowNode;
}

export type WorkflowRFNode = Node<RFNodeData>;
export type WorkflowRFEdge = Edge;

/** The React Flow `type` string for a domain node kind (drives which custom node
 *  component renders it). One-to-one with `WorkflowNode["kind"]`. */
function rfType(node: WorkflowNode): string {
  return node.kind;
}

/** Serialize a Condition arm to a React Flow `sourceHandle` id. */
function branchToHandle(branch: boolean | undefined): string | undefined {
  if (branch === undefined) return undefined;
  return branch ? "true" : "false";
}

/** Parse a React Flow `sourceHandle` back into a branch boolean (undefined for a
 *  plain sequential edge). */
function handleToBranch(handle: string | null | undefined): boolean | undefined {
  if (handle === "true") return true;
  if (handle === "false") return false;
  return undefined;
}

/** Stable edge id derived from its endpoints + branch, so re-deriving the RF graph
 *  keeps edge identity (React Flow selection/animation) stable across renders. */
export function edgeId(edge: WorkflowEdge): string {
  const suffix = edge.branch === undefined ? "seq" : edge.branch ? "true" : "false";
  return `${edge.from}->${edge.to}:${suffix}`;
}

/** Domain graph → React Flow graph. */
export function toReactFlow(workflow: Workflow): {
  nodes: WorkflowRFNode[];
  edges: WorkflowRFEdge[];
} {
  const nodes: WorkflowRFNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    type: rfType(node),
    position: { x: node.position.x, y: node.position.y },
    data: { node },
  }));

  const edges: WorkflowRFEdge[] = workflow.edges.map((edge) => ({
    id: edgeId(edge),
    source: edge.from,
    target: edge.to,
    sourceHandle: branchToHandle(edge.branch),
    type: "branch",
    data: { branch: edge.branch },
  }));

  return { nodes, edges };
}

/** React Flow graph → domain graph. React Flow owns live `position` (drag) so it
 *  is read back onto each node; the domain node otherwise round-trips verbatim. */
export function fromReactFlow(
  id: string,
  name: string,
  nodes: WorkflowRFNode[],
  edges: WorkflowRFEdge[],
): Workflow {
  const domainNodes: WorkflowNode[] = nodes.map((rfNode) => ({
    ...rfNode.data.node,
    position: { x: rfNode.position.x, y: rfNode.position.y },
  }));

  const domainEdges: WorkflowEdge[] = edges.map((rfEdge) => {
    const branch = handleToBranch(rfEdge.sourceHandle);
    const edge: WorkflowEdge = { from: rfEdge.source, to: rfEdge.target };
    if (branch !== undefined) edge.branch = branch;
    return edge;
  });

  return { id, name, nodes: domainNodes, edges: domainEdges };
}
