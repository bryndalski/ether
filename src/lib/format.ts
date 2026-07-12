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
