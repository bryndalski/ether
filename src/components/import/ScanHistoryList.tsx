import { MethodBadge } from "../common/MethodBadge";

interface ScanHistoryListProps {
  commands: string[];
  onPick: (command: string) => void;
}

const METHOD_FLAG = /-X\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/i;

/** Best-effort method parse from a curl one-liner: an explicit -X wins, else a
 *  body flag implies POST, else GET. Cosmetic only. */
export function methodOfCurl(command: string): string | null {
  const explicit = command.match(METHOD_FLAG);
  if (explicit) return explicit[1].toUpperCase();
  if (/\s(-d|--data|--data-raw|-F|--form)\b/.test(command)) return "POST";
  if (/\bcurl\b/i.test(command)) return "GET";
  return null;
}

/** Dumb selectable list of scanned curl one-liners. */
export function ScanHistoryList({ commands, onPick }: ScanHistoryListProps) {
  return (
    <div className="scan-list">
      {commands.map((command, index) => {
        const method = methodOfCurl(command);
        return (
          <button
            type="button"
            className="scan-row"
            key={`${command}-${index}`}
            title={command}
            onClick={() => onPick(command)}
          >
            {method && <MethodBadge method={method} />}
            <span className="scan-cmd">{command}</span>
          </button>
        );
      })}
    </div>
  );
}
