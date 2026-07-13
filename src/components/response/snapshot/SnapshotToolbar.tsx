import type { SnapshotVerdict } from "../../../lib/snapshot";
import { relativeTimeLabel } from "../../../lib/relativeTime";

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
  const hasBaseline = verdict.status !== "no-baseline";
  return (
    <div className="snap-toolbar">
      {!hasBaseline ? (
        <button type="button" className="snap-btn primary" onClick={onSave}>
          Zapisz snapshot
        </button>
      ) : (
        <>
          <button
            type="button"
            className="snap-btn"
            aria-label="Zaakceptuj bieżącą odpowiedź jako nowy wzorzec"
            disabled={verdict.status === "pass"}
            onClick={onAccept}
          >
            Akceptuj zmianę
          </button>
          <button
            type="button"
            className="snap-btn danger"
            aria-label="Usuń wzorzec snapshotu"
            onClick={onDelete}
          >
            Usuń wzorzec
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
