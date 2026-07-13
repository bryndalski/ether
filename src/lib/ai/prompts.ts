// Pure prompt builders + local-schema grounding. Kept out of React so the
// grounding (§2.1) and the injection guard (§3.2) are unit-testable without a
// component. Every builder redacts nothing by itself — callers pass already-
// redacted inputs; these only ASSEMBLE messages. See docs/architecture/local-ai.md §2.

import { type GraphQLSchema, parse, printSchema, validate } from "graphql";
import type { AiMessage } from "./types";
import { wrapUntrusted } from "./redact";

/** NL→GraphQL system prompt, GROUNDED in the local introspected schema so the
 *  model transforms (against a known vocabulary) rather than invents. The SDL is
 *  the ONLY allowed field surface. No network — the schema comes from cache. */
export function buildGraphqlMessages(query: string, schema: GraphQLSchema): AiMessage[] {
  const sdl = printSchema(schema);
  return [
    {
      role: "system",
      content:
        "You write a single GraphQL operation using ONLY the types and fields in " +
        "the schema below. Never invent a field. Return JSON { query, variables_json? }.\n" +
        "SCHEMA:\n" +
        sdl,
    },
    { role: "user", content: query },
  ];
}

/** Validate a model-produced query against the LOCAL schema. A query that
 *  references unknown fields (or won't parse) is rejected — no artifact. Returns
 *  the list of GraphQL validation errors (empty = valid). */
export function validateAgainstSchema(query: string, schema: GraphQLSchema): string[] {
  try {
    const document = parse(query);
    return validate(schema, document).map((error) => error.message);
  } catch (parseError) {
    return [String(parseError)];
  }
}

/** Explain-error system prompt: the response body is DATA in a delimiter, never
 *  instructions. Caller passes an ALREADY-redacted request summary + body. */
export function buildExplainErrorMessages(
  requestSummary: string,
  responseBody: string,
): AiMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a local API-debugging assistant. Diagnose why the request failed " +
        "and suggest a fix. Return JSON { markdown }.\n" +
        wrapUntrusted("response body", responseBody),
    },
    { role: "user", content: requestSummary },
  ];
}
