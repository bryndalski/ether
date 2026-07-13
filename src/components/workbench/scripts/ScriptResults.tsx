import type { ScriptOutcome } from "../../../lib/scripts";
import { useT } from "../../../i18n/useT";

interface ScriptResultsProps {
  /** The last outcome for the active script, or null before a run. */
  outcome: ScriptOutcome | null;
}

/** Renders a script's last outcome: an error banner when `ok=false`, the
 *  captured console lines, and the pass/fail test rows. Scrolls inside its own
 *  container (PWA rule — nothing grows the window). */
export function ScriptResults({ outcome }: ScriptResultsProps) {
  const t = useT();

  if (!outcome) {
    return (
      <div className="script-results" aria-label={t("scripts.resultsAria")}>
        <p className="script-empty">{t("scripts.notRun")}</p>
      </div>
    );
  }

  return (
    <div className="script-results" aria-label={t("scripts.resultsAria")}>
      {!outcome.ok && outcome.error && (
        <p className="script-error" role="alert">
          {t("scripts.error")}: {outcome.error}
        </p>
      )}

      <section className="script-console">
        <h4 className="script-heading">{t("scripts.consoleHeading")}</h4>
        {outcome.logs.length === 0 ? (
          <p className="script-empty">{t("scripts.noLogs")}</p>
        ) : (
          <pre className="script-log lok-scroll">
            {outcome.logs.map((line, index) => (
              <div key={index} className="script-log-line">
                {line}
              </div>
            ))}
          </pre>
        )}
      </section>

      <section className="script-tests">
        <h4 className="script-heading">{t("scripts.testsHeading")}</h4>
        {outcome.tests.length === 0 ? (
          <p className="script-empty">{t("scripts.noTests")}</p>
        ) : (
          <ul className="script-test-list">
            {outcome.tests.map((test, index) => (
              <li
                key={index}
                className={test.passed ? "script-test pass" : "script-test fail"}
              >
                <span className="script-test-chip" aria-hidden="true">
                  {test.passed ? "✓" : "✕"}
                </span>
                <span className="script-test-name">{test.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outcome.env_set.length > 0 && (
        <section className="script-env">
          <h4 className="script-heading">{t("scripts.envHeading")}</h4>
          <ul className="script-env-list">
            {outcome.env_set.map(([name, value], index) => (
              <li key={index} className="script-env-row">
                <code>{name}</code>
                <span aria-hidden="true"> = </span>
                <code>{value}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
