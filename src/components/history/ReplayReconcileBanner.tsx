import type { RedactionHole } from "../../lib/replay";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface ReplayReconcileBannerProps {
  holes: RedactionHole[];
  onDismiss: () => void;
}

/** Surfaced in the workbench after replaying an entry with redacted secrets. It
 *  lists each hole; Send stays blocked until the user re-supplies templates. */
export function ReplayReconcileBanner({ holes, onDismiss }: ReplayReconcileBannerProps) {
  const t = useT();
  if (holes.length === 0) return null;
  const names = holes.map((hole) => hole.name).join(", ");
  return (
    <div
      role="status"
      aria-live="polite"
      className="hist-banner"
      style={{
        color: "var(--lok-status-warn)",
        background: "var(--lok-status-warn-bg)",
        display: "flex",
        alignItems: "center",
        gap: "var(--lok-space-2)",
      }}
    >
      <Icon name="i-shield" size={15} />
      <span>
        {t("history.replayHintBefore")}
        <code>{"{{secret.NAME}}"}</code>
        {t("history.replayHintAfter")}{" "}
        <strong>{names}</strong>.
      </span>
      <button
        type="button"
        className="hist-iconbtn"
        aria-label={t("diff.dismissMessage")}
        style={{ marginLeft: "auto" }}
        onClick={onDismiss}
      >
        <Icon name="i-x" size={14} />
      </button>
    </div>
  );
}
