import { useMemo } from "react";
import type { Assertion, ResponseData } from "../../../lib/types";
import { evalAssertions, summarize } from "../../../lib/assertions";
import { AssertionResultRow } from "./AssertionResultRow";

interface AssertionResultsViewProps {
  response: ResponseData;
  assertions: Assertion[];
}

/** Runs evalAssertions against the response and renders a summary + one row per
 *  result. Pure display — memoized on [response, assertions]. */
export function AssertionResultsView({ response, assertions }: AssertionResultsViewProps) {
  const results = useMemo(
    () => evalAssertions(response, assertions),
    [response, assertions],
  );
  const summary = summarize(results);

  return (
    <div className="assert-view" role="tabpanel" aria-label="Wyniki asercji">
      <div className="assert-summary lok-tnums" role="status" aria-live="polite">
        <span className={summary.allPassed ? "assert-word pass" : "assert-word fail"}>
          {summary.allPassed ? "✓ Wszystkie spełnione" : "✗ Są niespełnione"}
        </span>
        <span>
          {summary.passed}/{summary.total} pass
          {summary.failed > 0 && ` · ${summary.failed} fail`}
          {summary.skipped > 0 && ` · ${summary.skipped} skip`}
        </span>
      </div>
      {results.map((result) => (
        <AssertionResultRow key={result.index} result={result} />
      ))}
    </div>
  );
}
