// The FE mirror of the Rust workflow contract (src-tauri/src/models.rs +
// src-tauri/src/workflow.rs). A 1:1 discriminated-union mirror so the compiler
// enforces parity — never invent a field the Rust side does not (de)serialize.

import type { StoredRequest } from "./types";

/** Canvas coordinates (React Flow's `position`). */
export interface NodePosition {
  x: number;
  y: number;
}

/** A request node's payload: a reference to a saved request XOR an inline copy.
 *  Untagged in Rust → the JSON is `{ request_ref }` or `{ request }`. */
export type RequestSource =
  | { request_ref: string }
  | { request: StoredRequest };

/** A closed, non-Turing-complete branch predicate (mirrors ConditionExpr). */
export type ConditionExpr =
  | { type: "status_equals"; expected: number }
  | { type: "status_in_range"; min: number; max: number }
  | { type: "json_path_exists"; path: string }
  | { type: "json_path_equals"; path: string; expected: string };

/** One node in the graph (tagged on `kind`, mirroring the Rust enum). */
export type WorkflowNode =
  | ({ kind: "request"; id: string; position: NodePosition } & RequestSource)
  | {
      kind: "extract";
      id: string;
      source: string;
      var_name: string;
      position: NodePosition;
    }
  | { kind: "condition"; id: string; expr: ConditionExpr; position: NodePosition }
  | { kind: "delay"; id: string; ms: number; position: NodePosition };

export type WorkflowNodeKind = WorkflowNode["kind"];

/** A directed edge. `branch` is set only on edges leaving a Condition node. */
export interface WorkflowEdge {
  from: string;
  to: string;
  branch?: boolean;
}

/** A saved workflow graph. */
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---- event contract (workflow-run channel, mirrors WorkflowEvent) ----

/** The Tauri event channel every workflow run streams on. */
export const WORKFLOW_CHANNEL = "workflow-run";

/** How many run-log events the buffer holds before dropping the oldest. */
export const RUN_LOG_CAP = 500;

export type WorkflowEventKind =
  | "started"
  | "succeeded"
  | "failed"
  | "extracted"
  | "log";

export interface WorkflowEvent {
  run_id: string;
  seq: number;
  ts: string; // ISO-8601 UTC, stamped by Rust
  node_id?: string; // absent only for run-level log events
  kind: WorkflowEventKind;
  data?: unknown; // succeeded → summary ; extracted → { var_name, value }
  message?: string; // failed / log line
}

/** Per-node run status that drives the node's status ring on the canvas. */
export type NodeRunStatus = "idle" | "running" | "ok" | "fail";

/** The overall run lifecycle state. */
export type RunState = "idle" | "running" | "done" | "failed" | "stopped";

/** Narrowing helper — a request node's source form (ref vs inline). */
export function isRequestRef(
  node: Extract<WorkflowNode, { kind: "request" }>,
): node is Extract<WorkflowNode, { kind: "request" }> & { request_ref: string } {
  return "request_ref" in node;
}
