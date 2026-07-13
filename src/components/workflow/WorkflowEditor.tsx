import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useT } from "../../i18n/useT";
import { useEnvStore } from "../../state/useEnvStore";
import { useWorkflowGraph } from "../../hooks/useWorkflowGraph";
import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowList } from "../../hooks/useWorkflowList";
import type { WorkflowNodeKind } from "../../lib/workflow";
import type { WorkflowRFNode } from "../../lib/workflowGraph";
import { WorkflowRunContext } from "./WorkflowRunContext";
import { WorkflowToolbar } from "./WorkflowToolbar";
import { NodePalette, DND_MIME } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { RunConfirmDialog } from "./RunConfirmDialog";
import { RequestNodeCard } from "./nodes/RequestNodeCard";
import { ExtractNodeCard } from "./nodes/ExtractNodeCard";
import { ConditionNodeCard } from "./nodes/ConditionNodeCard";
import { DelayNodeCard } from "./nodes/DelayNodeCard";
import { BranchEdge } from "./edges/BranchEdge";

const NODE_TYPES = {
  request: RequestNodeCard,
  extract: ExtractNodeCard,
  condition: ConditionNodeCard,
  delay: DelayNodeCard,
};
const EDGE_TYPES = { branch: BranchEdge };

/** The Workflows mode: React Flow canvas + palette + toolbar + inspector, wired to
 *  the graph/list/run hooks. Owns layout and event wiring only; all logic lives in
 *  the hooks. Wrapped in ReactFlowProvider so `screenToFlowPosition` works. */
function WorkflowEditorInner() {
  const t = useT();
  const list = useWorkflowList();
  const initial = useMemo(
    () => list.selected ?? { id: "", name: "", nodes: [], edges: [] },
    [list.selected],
  );
  const graph = useWorkflowGraph(initial);
  const run = useWorkflowRun();
  const activeEnv = useEnvStore((state) => state.activeEnvironment());

  const [confirmOpen, setConfirmOpen] = useState(false);
  const instanceRef = useRef<ReactFlowInstance<WorkflowRFNode> | null>(null);

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      graph.select(nodes.length > 0 ? nodes[0].id : null);
    },
    [graph],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(DND_MIME) as WorkflowNodeKind;
      if (!kind || !instanceRef.current) return;
      const position = instanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      graph.addNode(kind, position);
    },
    [graph],
  );

  const onSave = useCallback(async () => {
    const saved = await graph.save();
    list.applySaved(saved);
  }, [graph, list]);

  const startRun = useCallback(async () => {
    setConfirmOpen(false);
    await run.run(graph.toWorkflow(), activeEnv?.id ?? null);
  }, [run, graph, activeEnv]);

  const runContext = useMemo(
    () => ({ statuses: run.statuses, extracted: run.extracted }),
    [run.statuses, run.extracted],
  );

  return (
    <WorkflowRunContext.Provider value={runContext}>
      <div className="lok-wf-editor">
        <WorkflowToolbar
          name={graph.name}
          dirty={graph.dirty}
          runState={run.runState}
          onNameChange={graph.setName}
          onSave={() => void onSave()}
          onRun={() => setConfirmOpen(true)}
          onStop={run.stop}
        />
        <div className="lok-wf-editor__body">
          <NodePalette
            onAdd={(kind) => graph.addNode(kind, { x: 120, y: 120 })}
          />
          <div
            className="lok-wf-canvas"
            aria-label={t("workflow.canvasAria")}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
          >
            {graph.nodes.length === 0 && (
              <p className="lok-wf-canvas__empty">{t("workflow.emptyCanvas")}</p>
            )}
            <ReactFlow<WorkflowRFNode>
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={graph.onNodesChange}
              onEdgesChange={graph.onEdgesChange}
              onConnect={graph.connect}
              onSelectionChange={onSelectionChange}
              onInit={(instance) => {
                instanceRef.current = instance;
              }}
              nodesFocusable
              edgesFocusable
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
          <NodeInspector
            node={graph.selectedNode}
            onChange={(node) => graph.updateNode(node.id, node)}
            onDelete={graph.deleteNode}
          />
        </div>
      </div>
      {confirmOpen && (
        <RunConfirmDialog
          envName={activeEnv?.name ?? null}
          onConfirm={() => void startRun()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </WorkflowRunContext.Provider>
  );
}

export function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
    </ReactFlowProvider>
  );
}
