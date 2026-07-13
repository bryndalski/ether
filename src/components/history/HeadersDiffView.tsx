import type { HeaderDiffEntry } from "../../lib/jsonDiff";
import { useT } from "../../i18n/useT";
import type { TKey } from "../../i18n";

interface HeadersDiffViewProps {
  entries: HeaderDiffEntry[];
}

const SIGIL: Record<string, string> = { added: "+", removed: "−", changed: "~" };
const KIND_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};
const ACTION_KEY: Record<string, TKey> = {
  added: "diff.actionAdded",
  removed: "diff.actionRemoved",
  changed: "diff.actionChanged",
};

function lineText(entry: HeaderDiffEntry): string {
  if (entry.kind === "changed") return `${entry.before} → ${entry.after}`;
  return entry.kind === "removed" ? (entry.before ?? "") : (entry.after ?? "");
}

/** Header diff — added/removed/changed, never color-only (sigil + badge). */
export function HeadersDiffView({ entries }: HeadersDiffViewProps) {
  const t = useT();
  const actionText = (kind: string): string => t(ACTION_KEY[kind]);
  if (entries.length === 0) {
    return <div className="diff-empty">{t("diff.headersIdentical")}</div>;
  }
  return (
    <div className="diff-body lok-scroll" role="region" aria-label={t("diff.headersDiffRegion")}>
      {entries.map((entry) => (
        <div
          key={entry.name}
          className={`diff-line ${entry.kind}`}
          aria-label={t("diff.diffLineAria", {
            action: actionText(entry.kind),
            path: entry.name,
            text: lineText(entry),
          })}
        >
          <span className="diff-sigil" aria-hidden="true">
            {SIGIL[entry.kind]}
          </span>
          <span>
            <span className="diff-path">{entry.name}</span>
            <span className="diff-badge">{KIND_LABEL[entry.kind]}</span>
            <span> {lineText(entry)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
