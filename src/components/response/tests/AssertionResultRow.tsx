import type { AssertionResult } from "../../../lib/assertions";
import { assertionLabel } from "../../../lib/assertionDefaults";

interface AssertionResultRowProps {
  result: AssertionResult;
}

const SIGIL: Record<AssertionResult["status"], string> = {
  pass: "✓",
  fail: "✗",
  skipped: "○",
};

const STATUS_WORD: Record<AssertionResult["status"], string> = {
  pass: "Pass",
  fail: "Fail",
  skipped: "Skipped",
};

/** One assertion verdict. Never color-only: sigil + status word + aria-label,
 *  with expected-vs-actual shown on failure. */
export function AssertionResultRow({ result }: AssertionResultRowProps) {
  const label = assertionLabel(result.assertion);
  const word = STATUS_WORD[result.status];
  return (
    <div
      className={`assert-row ${result.status}`}
      aria-label={`Asercja ${word === "Pass" ? "spełniona" : word === "Fail" ? "niespełniona" : "pominięta"}: ${label}`}
    >
      <span className="assert-sigil" aria-hidden="true">
        {SIGIL[result.status]}
      </span>
      <span className="assert-word">{word}</span>
      <span className="assert-label">{label}</span>
      {result.status === "fail" && (
        <span className="assert-detail lok-tnums">
          {result.expected !== undefined && <>oczekiwano {result.expected}</>}
          {result.actual !== undefined && <> · otrzymano {result.actual}</>}
          {result.expected === undefined && result.actual === undefined && result.message}
        </span>
      )}
    </div>
  );
}
