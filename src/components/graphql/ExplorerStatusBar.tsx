import type { SchemaState } from "../../hooks/useGraphqlSchema";

interface ExplorerStatusBarProps {
  schemaState: SchemaState;
  typeCount: number;
  selectedFieldCount: number;
  lastRefreshLabel: string;
}

/** The bottom strip: schema health (dot + always a text label, never
 *  color-only) + "N types" + "K fields selected" + last-refresh. */
export function ExplorerStatusBar({
  schemaState,
  typeCount,
  selectedFieldCount,
  lastRefreshLabel,
}: ExplorerStatusBarProps) {
  const healthClass =
    schemaState === "error"
      ? "danger"
      : schemaState === "sdl-fallback"
        ? "warn"
        : "";
  const healthLabel =
    schemaState === "ready"
      ? `schema introspected · ${typeCount} types`
      : schemaState === "sdl-fallback"
        ? `SDL schema · ${typeCount} types`
        : schemaState === "introspecting"
          ? "introspecting…"
          : schemaState === "error"
            ? "schema error"
            : "no schema";

  return (
    <div className="gql-statusbar">
      <span className={`health ${healthClass}`.trim()} aria-live="polite">
        <span className="dot" aria-hidden="true" />
        {healthLabel}
      </span>
      <span className="spacer" />
      <span className="mono">query · {selectedFieldCount} fields selected</span>
      <span className="mono">last refresh {lastRefreshLabel}</span>
    </div>
  );
}
