// Number formatting helpers for the response meta / waterfall. Centralized so
// every timer / size renders with the same rounding and tabular-nums shape.

/** Round a millisecond duration to a whole number for display ("148"). */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0";
  return String(Math.round(ms));
}

/** Human-readable byte size: B under 1 KiB, then KB / MB with two decimals. */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const kilo = 1024;
  if (bytes < kilo) return `${Math.round(bytes)} B`;
  if (bytes < kilo * kilo) return `${(bytes / kilo).toFixed(2)} KB`;
  return `${(bytes / (kilo * kilo)).toFixed(2)} MB`;
}

/** Signed relative duration for the JWT countdown / cert validity: an absolute
 *  span ("4 min 12 s", "3 dni", "1 s") with tabular-friendly integer parts. The
 *  caller supplies the sign (temu / za …). Always ≥ "0 s". */
export function formatRelativeDuration(absMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(absMs) / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

/** mm:ss for a short countdown (< 1 h), else Xd Yh. Used by JwtCountdown. */
export function formatCountdown(absMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(absMs) / 1000));
  if (totalSeconds >= 86_400) {
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    return `${days}d ${hours}h`;
  }
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
