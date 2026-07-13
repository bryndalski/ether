import { useMemo, useState } from "react";
import type { ResponseData, ScrubConfig, SnapshotRecord } from "../../../lib/types";
import { compareSnapshot } from "../../../lib/snapshot";
import { JsonDiffView } from "../../history/JsonDiffView";
import { SnapshotToolbar } from "./SnapshotToolbar";

interface SnapshotViewProps {
  response: ResponseData;
  record: SnapshotRecord | null;
  scrubConfig: ScrubConfig;
  onSave: () => void;
  onAccept: () => void;
  onDelete: () => Promise<void> | void;
}

/** Snapshot verdict banner + toolbar + scrubbed diff (reusing JsonDiffView). */
export function SnapshotView({
  response,
  record,
  scrubConfig,
  onSave,
  onAccept,
  onDelete,
}: SnapshotViewProps) {
  const [confirming, setConfirming] = useState(false);
  const verdict = useMemo(
    () => compareSnapshot(record?.baseline ?? null, response, record?.scrub_config ?? scrubConfig),
    [record, response, scrubConfig],
  );

  const banner = (() => {
    switch (verdict.status) {
      case "no-baseline":
        return { cls: "neutral", text: "Brak wzorca — zapisz bieżącą odpowiedź." };
      case "pass":
        return { cls: "pass", text: "✓ Snapshot: zgodny" };
      case "non-json":
        return { cls: "fail", text: "✗ Snapshot: odpowiedzi różnią się (porównanie tekstowe)" };
      case "fail":
        return {
          cls: "fail",
          text: `✗ Snapshot: zmiana wykryta (${verdict.addedCount}+ / ${verdict.removedCount}− / ${verdict.changedCount}~)`,
        };
    }
  })();

  return (
    <div className="snap-view" role="tabpanel" aria-label="Snapshot">
      <div className={`snap-banner ${banner.cls}`} role="status" aria-live="polite">
        {banner.text}
      </div>
      <SnapshotToolbar
        verdict={verdict}
        createdAt={record?.created_at ?? null}
        onSave={onSave}
        onAccept={onAccept}
        onDelete={() => setConfirming(true)}
      />
      {verdict.status === "no-baseline" && (
        <p className="test-hint">
          Zapisz bieżącą odpowiedź jako wzorzec; kolejne wysyłki będą z nią
          porównywane, z pominięciem pól scrubowanych.
        </p>
      )}
      {verdict.status === "fail" && <JsonDiffView entries={verdict.diff} />}
      {confirming && (
        <div className="snap-confirm" role="alertdialog" aria-describedby="snap-confirm-msg">
          <p id="snap-confirm-msg">Usunąć wzorzec snapshotu?</p>
          <div className="snap-toolbar">
            <button type="button" className="snap-btn" onClick={() => setConfirming(false)}>
              Anuluj
            </button>
            <button
              type="button"
              className="snap-btn danger"
              onClick={() => {
                setConfirming(false);
                void onDelete();
              }}
            >
              Usuń
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
