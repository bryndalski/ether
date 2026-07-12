import type { HeaderDiffEntry } from "../../lib/jsonDiff";

interface HeadersDiffViewProps {
  entries: HeaderDiffEntry[];
}

const SIGIL: Record<string, string> = { added: "+", removed: "−", changed: "~" };
const KIND_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};
const ACTION_PL: Record<string, string> = {
  added: "Dodano",
  removed: "Usunięto",
  changed: "Zmieniono",
};

function lineText(entry: HeaderDiffEntry): string {
  if (entry.kind === "changed") return `${entry.before} → ${entry.after}`;
  return entry.kind === "removed" ? (entry.before ?? "") : (entry.after ?? "");
}

/** Header diff — added/removed/changed, never color-only (sigil + badge). */
export function HeadersDiffView({ entries }: HeadersDiffViewProps) {
  if (entries.length === 0) {
    return <div className="diff-empty">Nagłówki identyczne.</div>;
  }
  return (
    <div className="diff-body lok-scroll" role="region" aria-label="Diff nagłówków">
      {entries.map((entry) => (
        <div
          key={entry.name}
          className={`diff-line ${entry.kind}`}
          aria-label={`${ACTION_PL[entry.kind]} ${entry.name}: ${lineText(entry)}`}
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
