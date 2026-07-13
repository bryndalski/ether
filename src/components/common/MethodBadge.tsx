import type { CSSProperties } from "react";

const METHOD_HUE: Record<string, string> = {
  GET: "var(--lok-status-success)",
  POST: "var(--lok-status-warn)",
  PUT: "var(--lok-status-info)",
  PATCH: "var(--lok-heat-500)",
  DELETE: "var(--lok-status-danger)",
  HEAD: "var(--lok-status-neutral)",
  OPTIONS: "var(--lok-status-neutral)",
};

/** The method's hue as a CSS color expression — shared with the sidebar row's
 *  selected-state accent bar so selection reads as "this GET", not an alarm. */
export function methodHue(method: string): string {
  return METHOD_HUE[method.toUpperCase()] ?? "var(--lok-text-secondary)";
}

interface MethodBadgeProps {
  method: string;
}

/** Colored, tabular HTTP-method label used in the sidebar tree and palette. */
export function MethodBadge({ method }: MethodBadgeProps) {
  const upper = method.toUpperCase();
  const style: CSSProperties = {
    color: METHOD_HUE[upper] ?? "var(--lok-text-secondary)",
    fontFamily: "var(--lok-font-mono)",
    fontSize: "var(--lok-fs-2xs)",
    fontWeight: "var(--lok-fw-bold)" as CSSProperties["fontWeight"],
    letterSpacing: "var(--lok-tracking-wide)",
  };
  return (
    <span className="w-12 shrink-0 tabular-nums" style={style}>
      {upper}
    </span>
  );
}
