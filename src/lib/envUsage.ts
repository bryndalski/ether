// Cheap, pure counting of how many stored requests reference a given variable
// as `{{name}}`. Scans the fields a variable can plausibly appear in (url,
// header/param/form values, raw body, graphql query/variables). No React, no
// Tauri — unit-tested in isolation.

import type { Body, KeyValue, StoredRequest } from "./types";

function bodyText(body: Body): string {
  switch (body.type) {
    case "raw":
      return body.text;
    case "form_urlencoded":
      return kvText(body.fields);
    case "multipart":
      return body.parts
        .map((part) =>
          part.kind === "text"
            ? `${part.name} ${part.value}`
            : `${part.name} ${part.path}`,
        )
        .join(" ");
    default:
      return "";
  }
}

function kvText(rows: KeyValue[]): string {
  return rows.map((row) => `${row.name} ${row.value}`).join(" ");
}

/** All the text of one request where a `{{var}}` token could live. */
function requestText(request: StoredRequest): string {
  const parts = [
    request.url,
    kvText(request.headers),
    kvText(request.query_params),
    bodyText(request.body),
    request.graphql?.query ?? "",
    request.graphql?.variables_json ?? "",
  ];
  return parts.join(" ");
}

/** Count requests that reference `{{name}}` at least once. A single request is
 *  counted once even if it uses the variable in several places — the hint is
 *  "how many requests depend on this", not raw token frequency. */
export function countRequestsUsingVariable(
  requests: StoredRequest[],
  name: string,
): number {
  const trimmed = name.trim();
  if (trimmed === "") return 0;
  const token = `{{${trimmed}}}`;
  let count = 0;
  for (const request of requests) {
    if (requestText(request).includes(token)) count += 1;
  }
  return count;
}
