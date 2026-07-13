// Pure composition of a watch run's overall pass/fail — extracted so it's
// unit-testable without timers. A run is OK only when the HTTP status class is
// ok AND every assertion passed AND the snapshot did not fail.

import { statusClass } from "./httpStatus";
import type { AssertionSummary } from "./assertions";
import type { SnapshotStatus } from "./snapshot";

export function watchVerdict(args: {
  status: number | null;
  assertions: AssertionSummary | null;
  snapshot: SnapshotStatus | null;
}): boolean {
  const statusOk = args.status !== null && statusClass(args.status) === "success";
  const assertionsOk = args.assertions === null || args.assertions.allPassed;
  const snapshotOk = args.snapshot !== "fail";
  return statusOk && assertionsOk && snapshotOk;
}
