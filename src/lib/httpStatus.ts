// HTTP status → reason label + semantic status class. Status is NEVER color-only
// in the UI: the class picks a token, the reason label carries the meaning for
// screen readers and low-vision users (design-system §6).

export type StatusClass = "success" | "info" | "warn" | "danger" | "neutral";

const REASONS: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** Reason phrase for a status code, falling back to a generic class label. */
export function statusText(status: number): string {
  const known = REASONS[status];
  if (known) return known;
  if (status >= 200 && status < 300) return "Success";
  if (status >= 300 && status < 400) return "Redirect";
  if (status >= 400 && status < 500) return "Client Error";
  if (status >= 500 && status < 600) return "Server Error";
  return "Unknown";
}

/** Semantic class for the status, driving the color token. */
export function statusClass(status: number): StatusClass {
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "info";
  if (status >= 400 && status < 500) return "warn";
  if (status >= 500 && status < 600) return "danger";
  return "neutral"; // 1xx and 0 (never-sent / connection error)
}

const CLASS_TOKEN: Record<StatusClass, string> = {
  success: "var(--lok-status-success)",
  info: "var(--lok-status-info)",
  warn: "var(--lok-status-warn)",
  danger: "var(--lok-status-danger)",
  neutral: "var(--lok-status-neutral)",
};

/** CSS token for a status class (used by StatusBadge). */
export function statusColorToken(status: number): string {
  return CLASS_TOKEN[statusClass(status)];
}
