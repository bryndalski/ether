import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { workflowRun, workflowStop } from "../lib/ipc";
import { useWorkflowRun } from "./useWorkflowRun";
import type { Workflow, WorkflowEvent } from "../lib/workflow";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../lib/ipc", () => ({
  workflowRun: vi.fn(),
  workflowStop: vi.fn(),
}));

const mockListen = vi.mocked(listen);
const mockRun = vi.mocked(workflowRun);
const mockStop = vi.mocked(workflowStop);

type Handler = (event: { payload: WorkflowEvent }) => void;
let capturedHandler: Handler | null = null;
const unlistenSpy = vi.fn();

function emit(event: WorkflowEvent) {
  capturedHandler?.({ payload: event });
}

function evt(partial: Partial<WorkflowEvent>): WorkflowEvent {
  return {
    run_id: "run-1",
    seq: 0,
    ts: "2026-07-13T00:00:00Z",
    kind: "log",
    ...partial,
  };
}

const WORKFLOW: Workflow = { id: "w", name: "n", nodes: [], edges: [] };

beforeEach(() => {
  capturedHandler = null;
  unlistenSpy.mockReset();
  mockListen.mockReset();
  mockRun.mockReset();
  mockStop.mockReset();
  mockListen.mockImplementation((_name: string, handler: unknown) => {
    capturedHandler = handler as Handler;
    return Promise.resolve(unlistenSpy);
  });
  mockRun.mockResolvedValue("run-1");
  mockStop.mockResolvedValue(true);
});

afterEach(() => vi.clearAllMocks());

async function runAndWait(result: {
  current: ReturnType<typeof useWorkflowRun>;
}) {
  await act(async () => {
    await result.current.run(WORKFLOW, "env-1");
  });
  await waitFor(() => expect(capturedHandler).not.toBeNull());
}

describe("useWorkflowRun", () => {
  it("transitions a node idle → running → ok", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() => emit(evt({ kind: "started", node_id: "n1", seq: 0 })));
    expect(result.current.statuses.n1).toBe("running");

    act(() => emit(evt({ kind: "succeeded", node_id: "n1", seq: 1 })));
    expect(result.current.statuses.n1).toBe("ok");
  });

  it("records an extracted value and marks the node ok", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() =>
      emit(
        evt({
          kind: "extracted",
          node_id: "x",
          seq: 0,
          data: { var_name: "token", value: "abc" },
        }),
      ),
    );

    expect(result.current.extracted.token).toBe("abc");
    expect(result.current.statuses.x).toBe("ok");
  });

  it("flips a node to fail and sets error + runState on a failed event", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() =>
      emit(evt({ kind: "failed", node_id: "n2", seq: 0, message: "boom" })),
    );

    expect(result.current.statuses.n2).toBe("fail");
    expect(result.current.error).toBe("boom");
    expect(result.current.runState).toBe("failed");
  });

  it("ignores events for a different run_id (route by id)", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() =>
      emit(evt({ kind: "started", node_id: "n1", seq: 0, run_id: "OTHER" })),
    );

    expect(result.current.statuses.n1).toBeUndefined();
    expect(result.current.log).toHaveLength(0);
  });

  it("marks the run done on a 'run complete' log and clears the active id", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() => emit(evt({ kind: "log", seq: 0, message: "run complete" })));
    expect(result.current.runState).toBe("done");

    // active id cleared → a stray later event is ignored
    act(() => emit(evt({ kind: "started", node_id: "z", seq: 1 })));
    expect(result.current.statuses.z).toBeUndefined();
  });

  it("run() calls workflow_run with the workflow + env id", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);
    expect(mockRun).toHaveBeenCalledWith(WORKFLOW, "env-1");
    expect(result.current.runState).toBe("running");
  });

  it("stop() calls workflow_stop with the active run id and marks stopped", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    act(() => result.current.stop());

    expect(mockStop).toHaveBeenCalledWith("run-1");
    expect(result.current.runState).toBe("stopped");
  });

  it("cleans up on unmount: unlisten and stop the live run", async () => {
    const { result, unmount } = renderHook(() => useWorkflowRun());
    await runAndWait(result);

    unmount();

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledWith("run-1");
  });

  it("surfaces a run() rejection as a failed state with the error", async () => {
    mockRun.mockRejectedValueOnce("no start node");
    const { result } = renderHook(() => useWorkflowRun());

    await act(async () => {
      await result.current.run(WORKFLOW, null);
    });

    expect(result.current.runState).toBe("failed");
    expect(result.current.error).toContain("no start node");
  });
});
