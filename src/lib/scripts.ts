// TypeScript mirror of the Rust `ScriptOutcome`/`ScriptTest`/`RequestPatch`
// types (src-tauri/src/models.rs) and the `ScriptedResponse` returned by
// `resolve_and_send_scripted`. These cross the IPC boundary verbatim, so field
// names match the Rust serde names exactly.

import type { KeyValue, ResponseData } from "./types";

/** One script-authored test (from `lok.expect` / `lok.test`). */
export interface ScriptTest {
  name: string;
  passed: boolean;
}

/** The request fields a pre-script rewrote (only present ones are applied). */
export interface RequestPatch {
  method?: string;
  url?: string;
  body?: string;
  headers?: KeyValue[];
  query_params?: KeyValue[];
}

/** The total result of one sandboxed script run. `ok=false` on a throw/limit. */
export interface ScriptOutcome {
  ok: boolean;
  error?: string;
  logs: string[];
  request_patch?: RequestPatch;
  /** Run-vars the script set via `lok.env.set`, as [name, value] pairs. */
  env_set: [string, string][];
  tests: ScriptTest[];
}

/** The enriched send result: response + optional pre/post script outcomes. */
export interface ScriptedResponse {
  response: ResponseData;
  pre?: ScriptOutcome;
  post?: ScriptOutcome;
}

/** An empty, all-passing outcome — the neutral starting state for the UI. */
export const EMPTY_OUTCOME: ScriptOutcome = {
  ok: true,
  logs: [],
  env_set: [],
  tests: [],
};

/** A `{ passed, failed }` tally over a script's tests, for the summary chip. */
export function scriptTestTally(outcome: ScriptOutcome | null): {
  passed: number;
  failed: number;
} {
  if (!outcome) return { passed: 0, failed: 0 };
  let passed = 0;
  let failed = 0;
  for (const test of outcome.tests) {
    if (test.passed) passed += 1;
    else failed += 1;
  }
  return { passed, failed };
}
