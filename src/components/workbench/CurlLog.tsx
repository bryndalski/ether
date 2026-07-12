import type { CSSProperties } from "react";

interface CurlLogProps {
  text: string;
  className?: string;
  style?: CSSProperties;
}

// Tokenize a curl -v / preview line by its leading marker so we can colorize
// request (>), response (<) and info (*) lines, plus redacted secret runs.
function lineClass(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(">")) return "gt";
  if (trimmed.startsWith("<")) return "lt";
  if (trimmed.startsWith("*")) return "star";
  return "";
}

const REDACT_SPLIT = /(•{2,})/g;
const IS_REDACT = /^•{2,}$/;

function renderLine(line: string, index: number) {
  const cls = lineClass(line);
  // Highlight redacted runs (Rust already replaced secrets with • dots).
  const segments = line.split(REDACT_SPLIT).map((segment, i) =>
    IS_REDACT.test(segment) ? (
      <span className="redact" key={i}>
        {segment}
      </span>
    ) : (
      <span key={i}>{segment}</span>
    ),
  );
  return (
    <div className={cls} key={index}>
      {segments}
      {"\n"}
    </div>
  );
}

/** Read-only, selectable curl log with request/response/info/redact coloring.
 *  Shared by the cURL preview tab and the response verbose log. */
export function CurlLog({ text, className, style }: CurlLogProps) {
  return (
    <div className={`curl-log lok-selectable ${className ?? ""}`} style={style}>
      {text.split("\n").map(renderLine)}
    </div>
  );
}
