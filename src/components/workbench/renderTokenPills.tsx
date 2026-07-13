import { Fragment, type ReactNode } from "react";

// Splits a value into plain text + `{{...}}` token pills for the idle display
// span (the live editor uses the CM MatchDecorator; this mirrors its look in
// static React). Kept as a small pure helper so the cell stays presentational.
const TOKEN = /(\{\{[^}]*\}\})/g;

/** Render `value` with `{{...}}` tokens wrapped in a highlighted pill span. */
export function renderTokenPills(value: string): ReactNode {
  const parts = value.split(TOKEN);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <span key={index} className="cm-lok-token">
          {part}
        </span>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
