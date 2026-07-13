import { useT } from "../../i18n/useT";
import { PALETTE_KINDS } from "../../lib/workflowNodes";
import type { WorkflowNodeKind } from "../../lib/workflow";

const DND_MIME = "application/ether-workflow-node";

/** The palette of draggable step chips (Request · Extract · Condition · Delay).
 *  Each chip is a button (keyboard-focusable, aria-labeled) that starts a native
 *  drag carrying the node kind; the canvas reads it on drop. `onAdd` is the
 *  keyboard/click fallback so a step can be added without a pointer drag. */
export function NodePalette({
  onAdd,
}: {
  onAdd: (kind: WorkflowNodeKind) => void;
}) {
  const t = useT();

  const label: Record<WorkflowNodeKind, string> = {
    request: t("workflow.nodeRequest"),
    extract: t("workflow.nodeExtract"),
    condition: t("workflow.nodeCondition"),
    delay: t("workflow.nodeDelay"),
  };
  const desc: Record<WorkflowNodeKind, string> = {
    request: t("workflow.nodeRequestDesc"),
    extract: t("workflow.nodeExtractDesc"),
    condition: t("workflow.nodeConditionDesc"),
    delay: t("workflow.nodeDelayDesc"),
  };

  return (
    <aside className="lok-wf-palette" aria-label={t("workflow.paletteTitle")}>
      <div className="lok-wf-palette__title">{t("workflow.paletteTitle")}</div>
      <div className="lok-wf-palette__hint">{t("workflow.paletteHint")}</div>
      <ul className="lok-wf-palette__list">
        {PALETTE_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              className="lok-wf-chip"
              draggable
              data-kind={kind}
              aria-label={`${label[kind]} — ${desc[kind]}`}
              onDragStart={(event) => {
                event.dataTransfer.setData(DND_MIME, kind);
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onAdd(kind)}
            >
              <span className="lok-wf-chip__name">{label[kind]}</span>
              <span className="lok-wf-chip__desc">{desc[kind]}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export { DND_MIME };
