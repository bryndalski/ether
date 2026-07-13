// The script "Run in editor" lifecycle: calls run_pre_script / run_post_script
// against a snapshot and holds the last outcome per phase. The real send path
// surfaces its own outcomes (from resolve_and_send_scripted) separately; this
// hook is only for the editor's explicit Run button.

import { useCallback, useState } from "react";
import { runPostScript, runPreScript } from "../../../lib/ipc";
import type { ScriptOutcome } from "../../../lib/scripts";
import type { ResponseData, StoredRequest } from "../../../lib/types";

export type ScriptPhase = "pre" | "post";

interface RunnerState {
  pre: ScriptOutcome | null;
  post: ScriptOutcome | null;
  running: ScriptPhase | null;
}

export interface ScriptRunner {
  pre: ScriptOutcome | null;
  post: ScriptOutcome | null;
  running: ScriptPhase | null;
  runPre: (
    request: StoredRequest,
    environmentId: string | null,
    script: string,
  ) => Promise<void>;
  runPost: (
    response: ResponseData,
    script: string,
    variables: Record<string, string>,
  ) => Promise<void>;
  setOutcome: (phase: ScriptPhase, outcome: ScriptOutcome | null) => void;
}

const IDLE: RunnerState = { pre: null, post: null, running: null };

/** Holds the last pre/post outcome and drives the editor Run button. A thrown
 *  IPC error becomes an `ok=false` outcome so the results strip can render it. */
export function useScriptRunner(): ScriptRunner {
  const [state, setState] = useState<RunnerState>(IDLE);

  const runPre = useCallback(
    async (
      request: StoredRequest,
      environmentId: string | null,
      script: string,
    ) => {
      setState((prev) => ({ ...prev, running: "pre" }));
      try {
        const outcome = await runPreScript(request, environmentId, script);
        setState((prev) => ({ ...prev, pre: outcome, running: null }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          pre: ipcErrorOutcome(error),
          running: null,
        }));
      }
    },
    [],
  );

  const runPost = useCallback(
    async (
      response: ResponseData,
      script: string,
      variables: Record<string, string>,
    ) => {
      setState((prev) => ({ ...prev, running: "post" }));
      try {
        const outcome = await runPostScript(response, script, variables);
        setState((prev) => ({ ...prev, post: outcome, running: null }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          post: ipcErrorOutcome(error),
          running: null,
        }));
      }
    },
    [],
  );

  const setOutcome = useCallback(
    (phase: ScriptPhase, outcome: ScriptOutcome | null) => {
      setState((prev) => ({ ...prev, [phase]: outcome }));
    },
    [],
  );

  return {
    pre: state.pre,
    post: state.post,
    running: state.running,
    runPre,
    runPost,
    setOutcome,
  };
}

/** Wrap an IPC-level rejection as a failed outcome so the UI shows the reason. */
function ipcErrorOutcome(error: unknown): ScriptOutcome {
  return {
    ok: false,
    error: String(error),
    logs: [],
    env_set: [],
    tests: [],
  };
}
