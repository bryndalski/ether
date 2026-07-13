// Snapshot compare = scrub both bodies, then reuse jsonDiff verbatim. A pass is
// an empty scrubbed diff; a fail is any structural change on a non-scrubbed path.
// Non-JSON bodies fall back to raw text equality. Mirrors testing.md §2.3.

import { jsonDiff, type JsonDiffEntry } from "./jsonDiff";
import { scrubBody } from "./scrub";
import type { ResponseData, ScrubConfig } from "./types";

export type SnapshotStatus = "pass" | "fail" | "no-baseline" | "non-json";

export interface SnapshotVerdict {
  status: SnapshotStatus;
  diff: JsonDiffEntry[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
}

function counts(diff: JsonDiffEntry[]): Pick<
  SnapshotVerdict,
  "addedCount" | "removedCount" | "changedCount"
> {
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  for (const entry of diff) {
    if (entry.kind === "added") addedCount += 1;
    else if (entry.kind === "removed") removedCount += 1;
    else changedCount += 1; // changed + type-changed folded together
  }
  return { addedCount, removedCount, changedCount };
}

const EMPTY = { addedCount: 0, removedCount: 0, changedCount: 0 };

/** Compare a live response to a saved baseline after scrubbing both. */
export function compareSnapshot(
  baseline: ResponseData | null,
  current: ResponseData,
  config: ScrubConfig,
): SnapshotVerdict {
  if (baseline === null) {
    return { status: "no-baseline", diff: [], ...EMPTY };
  }

  const baseScrub = scrubBody(baseline.body, config);
  const currScrub = scrubBody(current.body, config);

  // If either side is non-JSON/base64/truncated, fall back to raw text equality.
  if (!baseScrub.ok || !currScrub.ok) {
    if (baseline.body === current.body) {
      return { status: "pass", diff: [], ...EMPTY };
    }
    const diff: JsonDiffEntry[] = [
      { path: "$", kind: "changed", before: baseline.body, after: current.body },
    ];
    return { status: "non-json", diff, addedCount: 0, removedCount: 0, changedCount: 1 };
  }

  const diff = jsonDiff(baseScrub.value, currScrub.value);
  if (diff.length === 0) {
    return { status: "pass", diff: [], ...EMPTY };
  }
  return { status: "fail", diff, ...counts(diff) };
}
