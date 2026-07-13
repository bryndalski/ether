import { statusText } from "../../lib/httpStatus";
import { relativeTimeLabel } from "../../lib/relativeTime";
import type { HistoryEntry } from "../../lib/types";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface DiffHeaderProps {
  a: HistoryEntry;
  b: HistoryEntry;
  now: number;
  onClose: () => void;
}

function chip(label: string, entry: HistoryEntry, now: number) {
  return (
    <span className="diff-chip lok-tnums" title={entry.executed_at}>
      <strong>{label}</strong>
      {entry.request.method} · {entry.response.status} {statusText(entry.response.status)} ·{" "}
      {relativeTimeLabel(entry.executed_at, now)}
    </span>
  );
}

/** A/B chips labeled by executed_at, plus close. */
export function DiffHeader({ a, b, now, onClose }: DiffHeaderProps) {
  const t = useT();
  return (
    <div className="diff-head">
      {chip("A ", a, now)}
      <span aria-hidden="true">vs</span>
      {chip("B ", b, now)}
      <button
        type="button"
        className="hist-iconbtn"
        aria-label={t("diff.closeCompare")}
        style={{ marginLeft: "auto" }}
        onClick={onClose}
      >
        <Icon name="i-x" size={15} />
      </button>
    </div>
  );
}
