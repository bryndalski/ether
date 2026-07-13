// The workflow-run streaming hook — the flagship's live feedback. Mirrors
// useSubscription: ONE global listen("workflow-run"), route each event by
// run_id === the active run, and reduce the stream into a per-node status map +
// extracted values + a run log. Cleanup stops any live run on unmount.

import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { workflowRun, workflowStop } from "../lib/ipc";
import {
  RUN_LOG_CAP,
  WORKFLOW_CHANNEL,
  type NodeRunStatus,
  type RunState,
  type Workflow,
  type WorkflowEvent,
} from "../lib/workflow";

export interface UseWorkflowRun {
  runState: RunState;
  statuses: Record<string, NodeRunStatus>; // node_id → status (drives node rings)
  extracted: Record<string, unknown>; // var_name → extracted value
  log: WorkflowEvent[]; // newest-last run trace
  error: string | null;
  run: (workflow: Workflow, environmentId: string | null) => Promise<void>;
  stop: () => void;
}

/** Cap the run log so a chatty run cannot grow memory without bound. */
function pushLog(buffer: WorkflowEvent[], event: WorkflowEvent): WorkflowEvent[] {
  const next = [...buffer, event];
  return next.length > RUN_LOG_CAP ? next.slice(next.length - RUN_LOG_CAP) : next;
}

/** Read `{ var_name, value }` out of an `extracted` event's `data`. */
function readExtracted(
  data: unknown,
): { name: string; value: unknown } | null {
  if (data && typeof data === "object" && "var_name" in data) {
    const record = data as { var_name?: unknown; value?: unknown };
    if (typeof record.var_name === "string") {
      return { name: record.var_name, value: record.value };
    }
  }
  return null;
}

export function useWorkflowRun(): UseWorkflowRun {
  const [runState, setRunState] = useState<RunState>("idle");
  const [statuses, setStatuses] = useState<Record<string, NodeRunStatus>>({});
  const [extracted, setExtracted] = useState<Record<string, unknown>>({});
  const [log, setLog] = useState<WorkflowEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    void listen<WorkflowEvent>(WORKFLOW_CHANNEL, ({ payload }) => {
      if (payload.run_id !== activeRunIdRef.current) return; // route by run id

      setLog((buffer) => pushLog(buffer, payload));

      if (payload.kind === "log") {
        const message = payload.message ?? "";
        if (message === "run complete") {
          setRunState("done");
          activeRunIdRef.current = null;
        } else if (message === "stopped") {
          setRunState("stopped");
          activeRunIdRef.current = null;
        }
        return;
      }

      const nodeId = payload.node_id;
      if (payload.kind === "started" && nodeId) {
        setStatuses((prev) => ({ ...prev, [nodeId]: "running" }));
        return;
      }
      if (payload.kind === "succeeded" && nodeId) {
        setStatuses((prev) => ({ ...prev, [nodeId]: "ok" }));
        return;
      }
      if (payload.kind === "extracted") {
        if (nodeId) setStatuses((prev) => ({ ...prev, [nodeId]: "ok" }));
        const value = readExtracted(payload.data);
        if (value) setExtracted((prev) => ({ ...prev, [value.name]: value.value }));
        return;
      }
      if (payload.kind === "failed") {
        if (nodeId) setStatuses((prev) => ({ ...prev, [nodeId]: "fail" }));
        setError(payload.message ?? "workflow failed");
        setRunState("failed");
        activeRunIdRef.current = null;
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      // Outside a Tauri webview (unit tests mocking only core IPC) `listen` may
      // reject — never surface that as an unhandled rejection.
      .catch(() => {});

    return () => {
      disposed = true;
      if (unlisten) unlisten();
      const activeId = activeRunIdRef.current;
      if (activeId) void workflowStop(activeId).catch(() => {});
    };
  }, []);

  const run = useCallback(
    async (workflow: Workflow, environmentId: string | null) => {
      // Tear down any live run before starting a new one.
      const previous = activeRunIdRef.current;
      if (previous) void workflowStop(previous).catch(() => {});

      setStatuses({});
      setExtracted({});
      setLog([]);
      setError(null);
      setRunState("running");
      try {
        const runId = await workflowRun(workflow, environmentId);
        activeRunIdRef.current = runId;
      } catch (caught) {
        setRunState("failed");
        setError(String(caught));
      }
    },
    [],
  );

  const stop = useCallback(() => {
    const activeId = activeRunIdRef.current;
    activeRunIdRef.current = null;
    setRunState("stopped");
    if (activeId) void workflowStop(activeId).catch(() => {});
  }, []);

  return { runState, statuses, extracted, log, error, run, stop };
}
