// A tiny relative-time label for the statusbar ("just now", "2 min ago").
// Pure and dependency-free so it stays unit-testable.

export function relativeTimeLabel(
  isoOrNull: string | null,
  now: number = Date.now(),
): string {
  if (!isoOrNull) return "never";
  const then = Date.parse(isoOrNull);
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
