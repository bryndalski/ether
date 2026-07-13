// Watch-mode: re-runs the current request on an interval and/or on a debounced
// draft change, feeding each settled response through evalAssertions +
// compareSnapshot to build a verdict. Pure FE orchestration over the real send
// path — one timer at a time, no overlap, strict cleanup. See testing.md §3.

import { useCallback, useEffect, useRef, useState } from "react";
import { evalAssertions, summarize, type AssertionSummary } from "../lib/assertions";
import { compareSnapshot, type SnapshotStatus } from "../lib/snapshot";
import { watchVerdict } from "../lib/watchVerdict";
import type { Assertion, ResponseData, ScrubConfig, StoredRequest } from "../lib/types";

export const MIN_INTERVAL = 2;
export const MAX_INTERVAL = 30;
const DEBOUNCE_MS = 600;

export interface WatchConfig {
  intervalSec: number;
  onInterval: boolean;
  onDraftChange: boolean;
  maxRuns: number;
}

export interface WatchRun {
  at: number;
  status: number | null;
  totalMs: number | null;
  assertions: AssertionSummary | null;
  snapshot: SnapshotStatus | null;
  ok: boolean;
  error: string | null;
}

export interface UseWatchMode {
  watching: boolean;
  runs: WatchRun[];
  start: () => void;
  stop: () => void;
  config: WatchConfig;
  setConfig: (patch: Partial<WatchConfig>) => void;
}

const DEFAULT_CONFIG: WatchConfig = {
  intervalSec: 5,
  onInterval: true,
  onDraftChange: false,
  maxRuns: 10,
};

function clampInterval(seconds: number): number {
  if (Number.isNaN(seconds)) return MIN_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(seconds)));
}

interface WatchArgs {
  draft: StoredRequest;
  environmentId: string | null;
  send: (draft: StoredRequest, env: string | null) => Promise<ResponseData | null>;
  assertions: Assertion[];
  snapshotConfig: ScrubConfig | null;
  baseline: ResponseData | null;
}

export function useWatchMode(args: WatchArgs): UseWatchMode {
  const [watching, setWatching] = useState(false);
  const [runs, setRuns] = useState<WatchRun[]>([]);
  const [config, setConfigState] = useState<WatchConfig>(DEFAULT_CONFIG);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  // Keep the freshest closure inputs in a ref so the recursive timer never runs
  // a stale draft/config without needing to re-schedule on every render.
  const argsRef = useRef(args);
  argsRef.current = args;
  const configRef = useRef(config);
  configRef.current = config;

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    timerRef.current = null;
    debounceRef.current = null;
  }, []);

  const buildRun = useCallback(
    (response: ResponseData | null, error: string | null): WatchRun => {
      const current = argsRef.current;
      const assertionSummary = response
        ? summarize(evalAssertions(response, current.assertions))
        : null;
      const snapshotStatus =
        response && current.snapshotConfig
          ? compareSnapshot(current.baseline, response, current.snapshotConfig).status
          : null;
      return {
        at: Date.now(),
        status: response ? response.status : null,
        totalMs: response ? response.timings.total_ms : null,
        assertions: assertionSummary,
        snapshot: snapshotStatus,
        ok:
          error === null &&
          watchVerdict({
            status: response ? response.status : null,
            assertions: assertionSummary,
            snapshot: snapshotStatus,
          }),
        error,
      };
    },
    [],
  );

  // One run: guarded so a draft-change trigger can't overlap an in-flight run.
  const runOnce = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let response: ResponseData | null = null;
    let error: string | null = null;
    try {
      const current = argsRef.current;
      response = await current.send(current.draft, current.environmentId);
    } catch (caught) {
      error = String(caught);
    } finally {
      runningRef.current = false;
    }
    if (!mountedRef.current) return;
    const run = buildRun(response, error);
    setRuns((prev) => [run, ...prev].slice(0, configRef.current.maxRuns));
  }, [buildRun]);

  // Recursive interval: schedule the NEXT run only after the current settles,
  // so a slow endpoint never causes overlapping requests.
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!configRef.current.onInterval) return;
    timerRef.current = setTimeout(async () => {
      await runOnce();
      if (mountedRef.current && watchingRef.current) scheduleNext();
    }, configRef.current.intervalSec * 1000);
  }, [runOnce]);

  // A ref mirror of `watching` so timers read the live value without re-binding.
  const watchingRef = useRef(false);
  watchingRef.current = watching;

  const start = useCallback(() => {
    setWatching(true);
    watchingRef.current = true;
    void (async () => {
      await runOnce(); // fire immediately, then schedule the interval
      if (mountedRef.current && watchingRef.current) scheduleNext();
    })();
  }, [runOnce, scheduleNext]);

  const stop = useCallback(() => {
    setWatching(false);
    watchingRef.current = false;
    clearTimers();
  }, [clearTimers]);

  const setConfig = useCallback((patch: Partial<WatchConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.intervalSec !== undefined) next.intervalSec = clampInterval(patch.intervalSec);
      return next;
    });
  }, []);

  // Debounced draft-change trigger: fires one run after the draft settles and
  // resets the interval clock so an interval + draft-change don't double-fire.
  const draftKey = JSON.stringify(args.draft);
  useEffect(() => {
    if (!watching || !config.onDraftChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await runOnce();
      if (mountedRef.current && watchingRef.current) scheduleNext();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // draftKey drives the debounce; runOnce/scheduleNext are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, watching, config.onDraftChange]);

  // Stop the loop when the active request changes (never fire a stale draft).
  useEffect(() => {
    stop();
    setRuns([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.draft.id]);

  // Cleanup on unmount: no timers, no setState-after-unmount.
  useEffect(() => {
    // Re-arm on mount so React StrictMode's mount→unmount→remount double-invoke
    // leaves mountedRef true after the second mount (the first unmount cleared it).
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  return { watching, runs, start, stop, config, setConfig };
}
