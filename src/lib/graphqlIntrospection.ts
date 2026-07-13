// Introspection without a new Rust command: the schema is fetched the SAME way
// any request is sent — through resolve_and_send — so it inherits the active
// request's URL, headers, and auth (introspection-with-auth). The FE builds the
// introspection POST here, parses the response into a GraphQLSchema, and manages
// the raw-JSON <-> schema round-trip for the SQLite cache (introspection payload
// vs. pasted-SDL sentinel).

import type { GraphQLSchema, IntrospectionQuery } from "graphql";
import {
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
} from "graphql";
import type { StoredRequest } from "./types";

/** The introspection request: same url/headers/auth as the draft, POST with the
 *  introspection query as a raw JSON body, and graphql:null (it is a plain POST,
 *  not "an operation"). */
export function buildIntrospectionRequest(
  draft: StoredRequest,
  endpointUrl: string,
): StoredRequest {
  const query = getIntrospectionQuery();
  return {
    ...draft,
    method: "POST",
    url: endpointUrl,
    query_params: [],
    body: {
      type: "raw",
      content_type: "application/json",
      text: JSON.stringify({ query }),
    },
    graphql: null,
    assertions: [],
  };
}

export type SchemaResult =
  | { schema: GraphQLSchema; error?: undefined }
  | { schema?: undefined; error: string };

/** Classify a resolve_and_send response body into a schema or an error message.
 *  Introspection-disabled endpoints commonly answer with `{ errors: [...] }`. */
export function parseSchemaResponse(body: string): SchemaResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { error: "Response is not JSON — the endpoint may not be GraphQL." };
  }
  const record = payload as {
    data?: { __schema?: unknown };
    errors?: { message?: string }[];
  };
  if (record.errors && record.errors.length > 0) {
    const first = record.errors[0]?.message ?? "introspection error";
    return { error: `Introspection rejected: ${first}` };
  }
  if (!record.data || !record.data.__schema) {
    return { error: "No __schema in response — introspection may be disabled." };
  }
  try {
    const schema = buildClientSchema(
      record.data as unknown as IntrospectionQuery,
    );
    return { schema };
  } catch (err) {
    return { error: `Malformed introspection: ${String(err)}` };
  }
}

/** Canonical cache string for a successful introspection: `{ data: {__schema} }`. */
export function introspectionEnvelope(introspectionData: unknown): string {
  return JSON.stringify({ data: introspectionData });
}

// Pasted SDL is cached wrapped in a sentinel so parseCache can tell it apart
// from an introspection payload on reload.
const SDL_SENTINEL = "__lok_sdl";

/** Canonical cache string for a pasted-SDL fallback schema. */
export function sdlEnvelope(sdlText: string): string {
  return JSON.stringify({ [SDL_SENTINEL]: sdlText });
}

/** Rebuild a GraphQLSchema from a cached envelope (introspection or SDL sentinel).
 *  Throws (GraphQLError) if the SDL is invalid — callers surface the message. */
export function parseCache(json: string): GraphQLSchema {
  const parsed = JSON.parse(json) as {
    __lok_sdl?: string;
    data?: unknown;
  };
  if (typeof parsed.__lok_sdl === "string") {
    return buildSchema(parsed.__lok_sdl);
  }
  return buildClientSchema(parsed.data as unknown as IntrospectionQuery);
}

/** Count schema types excluding the built-in introspection types (`__*`) and
 *  the standard scalars, so the statusbar shows a meaningful "N types". */
export function countSchemaTypes(schema: GraphQLSchema): number {
  return Object.keys(schema.getTypeMap()).filter(
    (name) => !name.startsWith("__"),
  ).length;
}
