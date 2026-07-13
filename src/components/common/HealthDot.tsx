import type { CSSProperties } from "react";

type Health = "up" | "checking" | "down" | "none";

interface HealthDotProps {
  health?: Health;
}

const HEALTH_HUE: Record<Health, string> = {
  up: "var(--lok-status-success)",
  checking: "var(--lok-status-warn)",
  down: "var(--lok-status-danger)",
  none: "var(--lok-status-neutral)",
};

/** Live env health dot. Color reads status (not env), so "prod down" is red
 *  regardless of the env accent. Defaults to neutral "none" — green (connected)
 *  must never show until something is actually connected. */
export function HealthDot({ health = "none" }: HealthDotProps) {
  const style: CSSProperties = {
    backgroundColor: HEALTH_HUE[health],
    width: 8,
    height: 8,
    borderRadius: "var(--lok-radius-full)",
  };
  return <span aria-hidden className="shrink-0" style={style} />;
}
