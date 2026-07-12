import { useMemo, useState } from "react";
import { headersDiff, jsonDiff, parseJsonBody } from "../../lib/jsonDiff";
import { timingDiff } from "../../lib/timingDiff";
import type { HistoryEntry, ResponseData } from "../../lib/types";
import { DiffHeader } from "./DiffHeader";
import { DiffTabs, type DiffTabKey } from "./DiffTabs";
import { JsonDiffView } from "./JsonDiffView";
import { HeadersDiffView } from "./HeadersDiffView";
import { TimingDiffView } from "./TimingDiffView";

interface DiffPanelProps {
  a: HistoryEntry;
  b: HistoryEntry;
  now: number;
  onClose: () => void;
}

/** JSON body is only diffed structurally when both sides parse and aren't base64
 *  / truncated; otherwise the view falls back to a raw text diff. */
function bodyIsJsonable(response: ResponseData): boolean {
  return !response.body_is_base64 && response.body_truncated_at === null;
}

/** Computes body / headers / timing diffs once (memoized) and renders the tabs. */
export function DiffPanel({ a, b, now, onClose }: DiffPanelProps) {
  const [tab, setTab] = useState<DiffTabKey>("Body");

  const { bodyEntries, bodyFallback } = useMemo(() => {
    const ra = a.response;
    const rb = b.response;
    const parsedA = bodyIsJsonable(ra) ? parseJsonBody(ra.body) : ({ ok: false } as const);
    const parsedB = bodyIsJsonable(rb) ? parseJsonBody(rb.body) : ({ ok: false } as const);
    if (parsedA.ok && parsedB.ok) {
      return { bodyEntries: jsonDiff(parsedA.value, parsedB.value), bodyFallback: null };
    }
    return { bodyEntries: [], bodyFallback: { before: ra.body, after: rb.body } };
  }, [a, b]);

  const headerEntries = useMemo(
    () => headersDiff(a.response.headers, b.response.headers),
    [a, b],
  );
  const timingDeltas = useMemo(
    () => timingDiff(a.response.timings, b.response.timings),
    [a, b],
  );

  const counts: Record<DiffTabKey, number> = {
    Body: bodyFallback ? 0 : bodyEntries.length,
    Headers: headerEntries.length,
    Timing: timingDeltas.filter((row) => row.deltaMs !== 0).length,
  };

  return (
    <div className="diff-panel">
      <DiffHeader a={a} b={b} now={now} onClose={onClose} />
      <DiffTabs active={tab} counts={counts} onSelect={setTab} />
      <div role="tabpanel" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {tab === "Body" && <JsonDiffView entries={bodyEntries} fallback={bodyFallback} />}
        {tab === "Headers" && <HeadersDiffView entries={headerEntries} />}
        {tab === "Timing" && <TimingDiffView deltas={timingDeltas} />}
      </div>
    </div>
  );
}
