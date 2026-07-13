// Owns the React Flow graph state (nodes/edges) for the workflow editor: seeding
// from a saved Workflow, adding a node from the palette, connecting two nodes,
// deleting a node (and pruning its edges), a dirty flag, and Save via
// workflow_upsert. Logic lives here so WorkflowEditor stays a layout component.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { workflowUpsert } from "../lib/ipc";
import {
  fromReactFlow,
  toReactFlow,
  type WorkflowRFEdge,
  type WorkflowRFNode,
} from "../lib/workflowGraph";
import { createNode } from "../lib/workflowNodes";
import type {
  NodePosition,
  Workflow,
  WorkflowNode,
  WorkflowNodeKind,
} from "../lib/workflow";

export interface UseWorkflowGraph {
  id: string;
  name: string;
  nodes: WorkflowRFNode[];
  edges: WorkflowRFEdge[];
  dirty: boolean;
  selectedNodeId: string | null;
  selectedNode: WorkflowNode | null;
  setName: (name: string) => void;
  onNodesChange: (changes: NodeChange<WorkflowRFNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<WorkflowRFEdge>[]) => void;
  connect: (connection: Connection) => void;
  addNode: (kind: WorkflowNodeKind, position: NodePosition) => void;
  updateNode: (id: string, node: WorkflowNode) => void;
  deleteNode: (id: string) => void;
  select: (id: string | null) => void;
  toWorkflow: () => Workflow;
  save: () => Promise<Workflow>;
  reset: (workflow: Workflow) => void;
}

const EMPTY_WORKFLOW: Workflow = { id: "", name: "", nodes: [], edges: [] };

export function useWorkflowGraph(
  initial: Workflow = EMPTY_WORKFLOW,
): UseWorkflowGraph {
  const seeded = useMemo(() => toReactFlow(initial), [initial]);
  const [id, setId] = useState(initial.id);
  const [name, setNameState] = useState(initial.name);
  const [nodes, setNodes] = useState<WorkflowRFNode[]>(seeded.nodes);
  const [edges, setEdges] = useState<WorkflowRFEdge[]>(seeded.edges);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Re-seed when a different saved workflow is opened.
  useEffect(() => {
    const rf = toReactFlow(initial);
    setId(initial.id);
    setNameState(initial.name);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setDirty(false);
    setSelectedNodeId(null);
  }, [initial]);

  const setName = useCallback((next: string) => {
    setNameState(next);
    setDirty(true);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<WorkflowRFNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    // Position drags and selection changes both flow through here; only a
    // structural change (add/remove/position) should flag dirty.
    if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) {
      setDirty(true);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<WorkflowRFEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (changes.some((c) => c.type !== "select")) setDirty(true);
  }, []);

  const connect = useCallback((connection: Connection) => {
    setEdges((current) =>
      addEdge({ ...connection, type: "branch" }, current) as WorkflowRFEdge[],
    );
    setDirty(true);
  }, []);

  const addNode = useCallback(
    (kind: WorkflowNodeKind, position: NodePosition) => {
      const node = createNode(kind, position);
      setNodes((current) => [
        ...current,
        { id: node.id, type: node.kind, position, data: { node } },
      ]);
      setDirty(true);
    },
    [],
  );

  const updateNode = useCallback((nodeId: string, node: WorkflowNode) => {
    setNodes((current) =>
      current.map((rfNode) =>
        rfNode.id === nodeId ? { ...rfNode, data: { node } } : rfNode,
      ),
    );
    setDirty(true);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((n) => n.id !== nodeId));
    // Prune every edge touching the removed node so no dangling edge survives.
    setEdges((current) =>
      current.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    setSelectedNodeId((selected) => (selected === nodeId ? null : selected));
    setDirty(true);
  }, []);

  const select = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const toWorkflow = useCallback(
    (): Workflow => fromReactFlow(id, name, nodes, edges),
    [id, name, nodes, edges],
  );

  const save = useCallback(async (): Promise<Workflow> => {
    const saved = await workflowUpsert(fromReactFlow(id, name, nodes, edges));
    setId(saved.id);
    setDirty(false);
    return saved;
  }, [id, name, nodes, edges]);

  const reset = useCallback((workflow: Workflow) => {
    const rf = toReactFlow(workflow);
    setId(workflow.id);
    setNameState(workflow.name);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setDirty(false);
    setSelectedNodeId(null);
  }, []);

  const selectedNode = useMemo<WorkflowNode | null>(() => {
    const rfNode = nodes.find((n) => n.id === selectedNodeId);
    return rfNode ? rfNode.data.node : null;
  }, [nodes, selectedNodeId]);

  return {
    id,
    name,
    nodes,
    edges,
    dirty,
    selectedNodeId,
    selectedNode,
    setName,
    onNodesChange,
    onEdgesChange,
    connect,
    addNode,
    updateNode,
    deleteNode,
    select,
    toWorkflow,
    save,
    reset,
  };
}
