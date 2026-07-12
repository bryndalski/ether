// The mini-benchmark loop state machine. Re-drives resolveAndSend() N times over
// the current request — the EXACT send path — collects each probe's
// timings.total_ms, and reports the latency distribution. Sequential by default
// (clean per-request samples, polite to a local endpoint), with an opt-in
// bounded concurrency pool capped at 4. Cancelable between probes.
//
// No new IPC: reuses resolveAndSend / cancelRequest from src/lib/ipc.ts.

import { useCallback, useRef, useState } from "react";
import { cancelRequest, resolveAndSend } from "../lib/ipc";
import { benchStats, type BenchStats } from "../lib/percentile";
import { makeId } from "../lib/ids";
import type { StoredRequest, Timings } from "../lib/types";

export type BenchPhase = "idle" | "running" | "done" | "canceled" | "error";

export interface BenchConfig {
  iterations: number; // clamp 1..500
  concurrency: number; // clamp 1..4
}

export interface BenchSample {
  index: number;
  totalMs: number;
  status: number;
  ok: boolean;
  timings: Timings;
}

export interface BenchState {
  phase: BenchPhase;
  config: BenchConfig;
  completed: number;
  samples: BenchSample[];
  stats: BenchStats | null;
  error: string | null;
  selectedIndex: number | null;
}

export interface UseBenchmark {
  benchState: BenchState;
  run: (
    draft: StoredRequest,
    environmentId: string | null,
    config: BenchConfig,
  ) => Promise<void>;
  cancel: () => void;
  selectSample: (index: number | null) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: BenchConfig = { iterations: 20, concurrency: 1 };

const IDLE: BenchState = {
  phase: "idle",
  config: DEFAULT_CONFIG,
  completed: 0,
  samples: [],
  stats: null,
  error: null,
  selectedIndex: null,
};

export function clampConfig(config: BenchConfig): BenchConfig {
  return {
    iterations: Math.min(500, Math.max(1, Math.floor(config.iterations))),
    concurrency: Math.min(4, Math.max(1, Math.floor(config.concurrency))),
  };
}

const EMPTY_TIMINGS: Timings = {
  dns_ms: 0,
  connect_ms: 0,
  tls_ms: 0,
  ttfb_ms: 0,
  total_ms: 0,
};

export function useBenchmark(): UseBenchmark {
  const [benchState, setBenchState] = useState<BenchState>(IDLE);
  const canceledRef = useRef(false);
  const currentProbeIdRef = useRef<string | null>(null);

  const run = useCallback(
    async (
      draft: StoredRequest,
      environmentId: string | null,
      rawConfig: BenchConfig,
    ) => {
      const config = clampConfig(rawConfig);
      canceledRef.current = false;
      const collected: BenchSample[] = [];
      setBenchState({
        phase: "running",
        config,
        completed: 0,
        samples: [],
        stats: null,
        error: null,
        selectedIndex: null,
      });

      // Each probe gets a distinct synthetic id so cancel targets the right one
      // and a bench probe never collides with a real send's history row.
      const probeDraft = (index: number): StoredRequest => ({
        ...draft,
        id: `${draft.id}#bench-${index}-${makeId("b")}`,
      });

      async function runProbe(index: number): Promise<void> {
        if (canceledRef.current) return;
        const probe = probeDraft(index);
        currentProbeIdRef.current = probe.id;
        let sample: BenchSample;
        try {
          const response = await resolveAndSend(probe, environmentId);
          sample = {
            index,
            totalMs: response.timings.total_ms,
            status: response.status,
            ok: true,
            timings: response.timings,
          };
        } catch {
          sample = {
            index,
            totalMs: 0,
            status: 0,
            ok: false,
            timings: EMPTY_TIMINGS,
          };
        }
        collected.push(sample);
        setBenchState((prev) => ({
          ...prev,
          completed: prev.completed + 1,
          samples: [...collected],
        }));
      }

      try {
        if (config.concurrency <= 1) {
          for (let index = 0; index < config.iterations; index += 1) {
            if (canceledRef.current) break;
            await runProbe(index);
          }
        } else {
          // Fixed-size async pool: `concurrency` workers drain a shared cursor.
          let cursor = 0;
          const next = async (): Promise<void> => {
            while (!canceledRef.current && cursor < config.iterations) {
              const index = cursor;
              cursor += 1;
              await runProbe(index);
            }
          };
          await Promise.all(
            Array.from({ length: config.concurrency }, () => next()),
          );
        }

        const okMs = collected
          .filter((sample) => sample.ok)
          .map((sample) => sample.totalMs);
        const stats = benchStats(okMs);
        setBenchState((prev) => ({
          ...prev,
          phase: canceledRef.current ? "canceled" : "done",
          samples: [...collected],
          stats,
        }));
      } catch (error) {
        setBenchState((prev) => ({
          ...prev,
          phase: "error",
          error: String(error),
        }));
      } finally {
        currentProbeIdRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    canceledRef.current = true;
    const probeId = currentProbeIdRef.current;
    if (probeId) void cancelRequest(probeId).catch(() => {});
    setBenchState((prev) =>
      prev.phase === "running" ? { ...prev, phase: "canceled" } : prev,
    );
  }, []);

  const selectSample = useCallback((index: number | null) => {
    setBenchState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  const reset = useCallback(() => {
    canceledRef.current = false;
    setBenchState(IDLE);
  }, []);

  return { benchState, run, cancel, selectSample, reset };
}
