import { statusColorToken, statusText } from "../../lib/httpStatus";
import { relativeTimeLabel } from "../../lib/relativeTime";
import type { HistoryEntry } from "../../lib/types";
import { Icon } from "../common/Icon";
import { MethodBadge } from "../common/MethodBadge";
import { HistoryRowMeta } from "./HistoryRowMeta";
import { useT } from "../../i18n/useT";

interface HistoryRowProps {
  entry: HistoryEntry;
  active: boolean;
  selectionIndex: number | null;
  now: number;
  onOpen: () => void;
  onToggleSelect: () => void;
  onReplay: () => void;
}

const ORDINAL = ["A", "B"];

/** One history entry: method · status · url · meta, with select-for-diff and
 *  replay affordances. Whole row opens the read-only preview; status is never
 *  color-only (reason text paired). */
export function HistoryRow({
  entry,
  active,
  selectionIndex,
  now,
  onOpen,
  onToggleSelect,
  onReplay,
}: HistoryRowProps) {
  const t = useT();
  const { method, url } = entry.request;
  const { status } = entry.response;
  const summary = t("history.rowSummary", {
    method,
    url,
    status,
    statusText: statusText(status),
    when: relativeTimeLabel(entry.executed_at, now),
  });
  const selected = selectionIndex !== null;

  return (
    <div className={`hist-row${active ? " active" : ""}`}>
      <button
        type="button"
        className="contents"
        style={{ display: "contents" }}
        aria-label={summary}
        onClick={onOpen}
      >
        <MethodBadge method={method} />
        <span
          className="lok-tnums"
          style={{ color: statusColorToken(status), fontFamily: "var(--lok-font-mono)", fontSize: "var(--lok-fs-xs)" }}
          title={statusText(status)}
        >
          {status}
        </span>
        <span className="hist-row-url" title={url}>
          {url}
        </span>
        <HistoryRowMeta entry={entry} now={now} />
      </button>
      <span className="hist-row-actions">
        <button
          type="button"
          className="hist-iconbtn"
          aria-label={t("history.replayRequest")}
          title={t("history.replayRequestTitle")}
          onClick={onReplay}
        >
          <Icon name="i-replay" size={14} />
        </button>
        <button
          type="button"
          className="hist-select"
          aria-pressed={selected}
          aria-label={t("history.selectToCompare", { method, url })}
          onClick={onToggleSelect}
        >
          {selected ? ORDINAL[selectionIndex] : ""}
        </button>
      </span>
    </div>
  );
}
