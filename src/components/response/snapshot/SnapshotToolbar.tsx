import type { SnapshotVerdict } from "../../../lib/snapshot";
import { relativeTimeLabel } from "../../../lib/relativeTime";
import { useT } from "../../../i18n/useT";

interface SnapshotToolbarProps {
  verdict: SnapshotVerdict;
  createdAt: string | null;
  onSave: () => void;
  onAccept: () => void;
  onDelete: () => void;
}

/** Save (no baseline) | Accept (on a fail) | Delete (when a baseline exists). */
export function SnapshotToolbar({
  verdict,
  createdAt,
  onSave,
  onAccept,
  onDelete,
}: SnapshotToolbarProps) {
  const t = useT();
  const hasBaseline = verdict.status !== "no-baseline";
  return (
    <div className="snap-toolbar">
      {!hasBaseline ? (
        <button type="button" className="snap-btn primary" onClick={onSave}>
          {t("snapshot.saveSnapshot")}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="snap-btn"
            aria-label={t("snapshot.acceptCurrentAria")}
            disabled={verdict.status === "pass"}
            onClick={onAccept}
          >
            {t("snapshot.acceptChange")}
          </button>
          <button
            type="button"
            className="snap-btn danger"
            aria-label={t("snapshot.deleteBaselineAria")}
            onClick={onDelete}
          >
            {t("snapshot.deleteBaseline")}
          </button>
          {createdAt && (
            <span className="snap-when lok-tnums" title={createdAt}>
              {relativeTimeLabel(createdAt)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
