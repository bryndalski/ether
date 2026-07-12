import type { StoredRequest } from "../../lib/types";
import { SendButton } from "./SendButton";

interface RequestToolbarProps {
  request: StoredRequest | null;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Method selector + URL field + Send (Zone 2 toolbar, 44px). Read-only
 *  placeholder for the shell — the two-way curl editor lands later. */
export function RequestToolbar({ request }: RequestToolbarProps) {
  const hasUrl = Boolean(request?.url);
  return (
    <div
      className="flex shrink-0 items-center gap-2 px-3"
      style={{
        height: "var(--lok-toolbar-h)",
        borderBottom: "1px solid var(--lok-border-subtle)",
      }}
    >
      <select
        aria-label="Metoda HTTP"
        defaultValue={request?.method ?? "GET"}
        className="lok-mono rounded-[var(--lok-radius-sm)] px-2 py-1"
        style={{
          backgroundColor: "var(--lok-bg-raised)",
          color: "var(--lok-text-primary)",
          fontSize: "var(--lok-fs-sm)",
          border: "1px solid var(--lok-border-default)",
        }}
      >
        {METHODS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>

      <input
        type="text"
        aria-label="URL requestu"
        placeholder="https://api.example.com/{{env.host}}/users"
        defaultValue={request?.url ?? ""}
        className="lok-mono flex-1 rounded-[var(--lok-radius-sm)] px-3 py-1.5"
        style={{
          backgroundColor: "var(--lok-bg-input)",
          color: "var(--lok-text-primary)",
          fontSize: "var(--lok-fs-md)",
          border: "1px solid var(--lok-border-default)",
        }}
      />

      <SendButton disabled={!hasUrl} />
    </div>
  );
}
