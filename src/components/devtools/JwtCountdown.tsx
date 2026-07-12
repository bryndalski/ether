import { useJwtCountdown } from "../../hooks/useJwtCountdown";

interface JwtCountdownProps {
  payload: Record<string, unknown> | null;
}

const STATUS_TOKEN: Record<string, string> = {
  valid: "var(--lok-status-success)",
  "expiring-soon": "var(--lok-status-warn)",
  expired: "var(--lok-status-danger)",
  "not-yet-valid": "var(--lok-status-info)",
  "no-exp": "var(--lok-status-neutral)",
};

/** Live 1 Hz countdown to exp/nbf. Its own file so the interval is isolated.
 *  The pulse is CSS-only (reduced-motion gated); the value always updates. */
export function JwtCountdown({ payload }: JwtCountdownProps) {
  const { status, label } = useJwtCountdown(payload);
  const color = STATUS_TOKEN[status] ?? "var(--lok-status-neutral)";
  const pulse = status === "expiring-soon" || status === "expired";
  return (
    <span
      className={pulse ? "dv-countdown dv-countdown-pulse lok-tnums" : "dv-countdown lok-tnums"}
      style={{ color }}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
