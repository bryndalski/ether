import { useState } from "react";
import type { ResponseData, StoredRequest } from "../../../lib/types";
import type { ScriptOutcome } from "../../../lib/scripts";
import { useT } from "../../../i18n/useT";
import { ScriptEditor } from "./ScriptEditor";
import { ScriptResults } from "./ScriptResults";
import { SnippetHelp } from "./SnippetHelp";
import { useScriptRunner, type ScriptPhase } from "./useScriptRunner";

interface ScriptsPanelProps {
  draft: StoredRequest;
  environmentId: string | null;
  /** The last response, used to run the post-script against real data. */
  lastResponse: ResponseData | null;
  /** Outcomes from the most recent real send (resolve_and_send_scripted). */
  sendOutcomes: { pre: ScriptOutcome | null; post: ScriptOutcome | null };
  onPreScriptChange: (script: string) => void;
  onPostScriptChange: (script: string) => void;
}

/** The "Scripts" request tab: a segmented Pre-request | Tests(post) control, the
 *  active CodeMirror JS editor, a snippet helper, and the last outcome strip. */
export function ScriptsPanel({
  draft,
  environmentId,
  lastResponse,
  sendOutcomes,
  onPreScriptChange,
  onPostScriptChange,
}: ScriptsPanelProps) {
  const t = useT();
  const [phase, setPhase] = useState<ScriptPhase>("pre");
  const runner = useScriptRunner();

  const isPre = phase === "pre";
  const value = (isPre ? draft.pre_script : draft.post_script) ?? "";
  const onChange = isPre ? onPreScriptChange : onPostScriptChange;

  // Prefer a fresh editor-run outcome; fall back to the last real-send outcome.
  const outcome =
    (isPre ? runner.pre : runner.post) ??
    (isPre ? sendOutcomes.pre : sendOutcomes.post);

  const canRunPost = lastResponse != null;
  const running = runner.running === phase;

  function onRun() {
    if (isPre) {
      void runner.runPre(draft, environmentId, value);
    } else if (lastResponse) {
      void runner.runPost(lastResponse, value, {});
    }
  }

  function onInsertSnippet(snippet: string) {
    const next = value.trim() === "" ? snippet : `${value}\n${snippet}`;
    onChange(next);
  }

  return (
    <div
      className="scripts-panel lok-scroll"
      role="tabpanel"
      aria-label={t("scripts.tabAria")}
    >
      <div className="scripts-toolbar">
        <div
          className="scripts-segments"
          role="tablist"
          aria-label={t("scripts.segmentsAria")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={isPre}
            className={isPre ? "scripts-seg active" : "scripts-seg"}
            onClick={() => setPhase("pre")}
          >
            {t("scripts.preRequest")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isPre}
            className={!isPre ? "scripts-seg active" : "scripts-seg"}
            onClick={() => setPhase("post")}
          >
            {t("scripts.tests")}
          </button>
        </div>
        <button
          type="button"
          className="scripts-run"
          onClick={onRun}
          disabled={running || (!isPre && !canRunPost)}
          title={!isPre && !canRunPost ? t("scripts.needResponse") : undefined}
        >
          {running ? t("scripts.running") : t("scripts.run")}
        </button>
      </div>

      <p className="scripts-hint">
        {isPre ? t("scripts.emptyHint") : t("scripts.emptyHintPost")}
      </p>
      <p className="scripts-limit-note">{t("scripts.limitNote")}</p>

      <ScriptEditor
        value={value}
        ariaLabel={isPre ? t("scripts.preAria") : t("scripts.postAria")}
        placeholder={isPre ? t("scripts.prePlaceholder") : t("scripts.postPlaceholder")}
        onChange={onChange}
      />

      <SnippetHelp phase={phase} onInsert={onInsertSnippet} />

      <ScriptResults outcome={outcome} />
    </div>
  );
}
