import type { SchemaState } from "../../hooks/useGraphqlSchema";
import { Icon } from "../common/Icon";

interface RefreshSchemaButtonProps {
  state: SchemaState;
  onRefresh: () => void;
}

/** Re-introspects the endpoint (§1.4). Spins + aria-busy while introspecting;
 *  the spin is CSS-only so prefers-reduced-motion collapses it. */
export function RefreshSchemaButton({ state, onRefresh }: RefreshSchemaButtonProps) {
  const busy = state === "introspecting";
  return (
    <button
      type="button"
      className="btn refresh"
      aria-label="Odśwież schemat"
      aria-busy={busy}
      disabled={busy}
      onClick={onRefresh}
    >
      <Icon name="i-refresh" size={14} />
      Refresh schema
    </button>
  );
}
