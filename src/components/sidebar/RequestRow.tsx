import type { StoredRequest } from "../../lib/types";
import { MethodBadge } from "../common/MethodBadge";

interface RequestRowProps {
  request: StoredRequest;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** A single request in the collection tree. Selected rows get the heat-tinted
 *  background + a 2px left brand edge (UX foundation §6). */
export function RequestRow({ request, selected, onSelect }: RequestRowProps) {
  return (
    <button
      type="button"
      aria-current={selected}
      onClick={() => onSelect(request.id)}
      className="flex w-full items-center gap-2 py-1.5 pl-4 pr-2 text-left transition-colors hover:bg-[var(--lok-bg-hover)]"
      style={{
        fontSize: "var(--lok-fs-sm)",
        color: selected
          ? "var(--lok-text-primary)"
          : "var(--lok-text-secondary)",
        backgroundColor: selected ? "var(--lok-bg-selected)" : undefined,
        borderLeft: selected
          ? "2px solid var(--lok-brand)"
          : "2px solid transparent",
      }}
    >
      <MethodBadge method={request.method} />
      <span className="truncate">{request.name}</span>
    </button>
  );
}
