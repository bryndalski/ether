import { statusColorToken, statusText } from "../../lib/httpStatus";

interface StatusBadgeProps {
  status: number;
  httpVersion: string;
}

/** Big mono status code + reason, colored by class. Never color-only — the
 *  reason label carries the meaning; aria-live announces new statuses. */
export function StatusBadge({ status, httpVersion }: StatusBadgeProps) {
  return (
    <div className="resp-status" aria-live="polite">
      <span
        className="code"
        style={{ color: statusColorToken(status) }}
        title={httpVersion}
      >
        {status}
      </span>
      <span className="txt">{statusText(status)}</span>
    </div>
  );
}
