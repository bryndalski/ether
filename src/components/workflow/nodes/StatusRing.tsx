import { useT } from "../../../i18n/useT";
import type { NodeRunStatus } from "../../../lib/workflow";

/** A node's run-status indicator: an icon + a text label (never color-only, per
 *  the a11y contract). The heat/success/danger hue comes from the parent card's
 *  `data-status` so the ring stays a single source of styling. */
export function StatusRing({ status }: { status: NodeRunStatus }) {
  const t = useT();
  const label: Record<NodeRunStatus, string> = {
    idle: t("workflow.statusIdle"),
    running: t("workflow.statusRunning"),
    ok: t("workflow.statusOk"),
    fail: t("workflow.statusFail"),
  };
  const glyph: Record<NodeRunStatus, string> = {
    idle: "○",
    running: "◐",
    ok: "✓",
    fail: "✗",
  };
  return (
    <span className="lok-wf-node__status" data-status={status}>
      <span aria-hidden>{glyph[status]}</span>
      <span className="lok-wf-node__status-label">{label[status]}</span>
    </span>
  );
}
