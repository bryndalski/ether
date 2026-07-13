// Pretty-print a stream event payload for display. Pure + safe: anything that
// is not JSON-serializable (rare for a graphql payload) falls back to String().

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
