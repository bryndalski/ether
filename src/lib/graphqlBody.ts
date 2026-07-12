// Builds the canonical GraphQL POST envelope `{"query": ..., "variables": ...}`
// as a raw JSON *string*. Critical property: `{{env.x}}` / `{{secret.x}}`
// templates inside the query or variables must survive verbatim into the body so
// Rust (resolve_and_send) interpolates them. That is our differentiator over
// browser GraphiQL — so we must NOT re-parse or reformat variablesJson (which
// could escape or eat the `{{...}}` tokens). We JSON-encode the query (safe on
// any content) and inline variablesJson literally.

import type { StoredRequest } from "./types";

/** Produce the `{query, variables}` JSON body string, `{{...}}`-preserving. */
export function buildGraphqlBody(query: string, variablesJson: string): string {
  const trimmed = (variablesJson ?? "").trim();
  const variables = trimmed === "" ? "{}" : variablesJson;
  return `{"query":${JSON.stringify(query ?? "")},"variables":${variables}}`;
}

/** Turn a GraphQL draft into the StoredRequest actually sent: a POST with the
 *  `{query,variables}` raw JSON body. url/headers/auth/options are untouched, so
 *  the same env/secret/SigV4 layer applies. A REST draft is returned unchanged. */
export function buildOperationRequest(draft: StoredRequest): StoredRequest {
  if (!draft.graphql) return draft;
  const text = buildGraphqlBody(
    draft.graphql.query,
    draft.graphql.variables_json,
  );
  return {
    ...draft,
    method: "POST",
    query_params: [],
    body: { type: "raw", content_type: "application/json", text },
  };
}
