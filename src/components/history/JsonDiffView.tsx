import type { JsonDiffEntry } from "../../lib/jsonDiff";
import { useT } from "../../i18n/useT";
import type { TKey } from "../../i18n";

interface JsonDiffViewProps {
  entries: JsonDiffEntry[];
  /** Raw body fallback when either side is not parseable JSON. */
  fallback?: { before: string; after: string } | null;
}

const SIGIL: Record<string, string> = {
  added: "+",
  removed: "−",
  changed: "~",
  "type-changed": "~",
};

const KIND_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  "type-changed": "Type",
};

const ACTION_KEY: Record<string, TKey> = {
  added: "diff.actionAdded",
  removed: "diff.actionRemoved",
  changed: "diff.actionChanged",
  "type-changed": "diff.actionTypeChanged",
};

function preview(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function lineText(entry: JsonDiffEntry): string {
  if (entry.kind === "type-changed") {
    return `${preview(entry.before)} → ${preview(entry.after)}  (${entry.beforeType} → ${entry.afterType})`;
  }
  if (entry.kind === "changed") return `${preview(entry.before)} → ${preview(entry.after)}`;
  if (entry.kind === "removed") return preview(entry.before);
  return preview(entry.after);
}

/** Structural JSON body diff. Never color-only: every row carries a +/−/~ sigil,
 *  a kind badge, and an aria-label. type-changed adds a "Type" pill. */
export function JsonDiffView({ entries, fallback }: JsonDiffViewProps) {
  const t = useT();
  const actionText = (kind: string): string => t(ACTION_KEY[kind]);
  if (fallback) {
    return (
      <div className="diff-body lok-scroll" role="region" aria-label={t("diff.bodyDiffTextRegion")}>
        <p className="diff-empty">{t("diff.nonJsonBody")}</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{fallback.before}</pre>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.7 }}>{fallback.after}</pre>
      </div>
    );
  }

  if (entries.length === 0) {
    return <div className="diff-empty">{t("diff.bodyIdentical")}</div>;
  }

  return (
    <div className="diff-body lok-scroll" role="region" aria-label={t("diff.bodyDiffRegion")}>
      {entries.map((entry) => (
        <div
          key={entry.path}
          className={`diff-line ${entry.kind}`}
          aria-label={t("diff.diffLineAria", {
            action: actionText(entry.kind),
            path: entry.path,
            text: lineText(entry),
          })}
        >
          <span className="diff-sigil" aria-hidden="true">
            {SIGIL[entry.kind]}
          </span>
          <span>
            <span className="diff-path">{entry.path}</span>
            <span className="diff-badge">{KIND_LABEL[entry.kind]}</span>
            {entry.kind === "type-changed" && (
              <span className="diff-badge">Type</span>
            )}
            <span> {lineText(entry)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
