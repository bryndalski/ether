// JSON Schemas passed to Ollama as `format` (structured output). Each schema is
// the SHAPE OF THE ARTIFACT, mirrored to the existing model types so validation
// (validate.ts) is a narrowing, never a translation. Constraining the output is
// also a security control: the model can't return a shell command or JS — only
// fields of a schema we re-validate. See docs/architecture/local-ai.md §2.2/§3.4.

import type { AiActionKind } from "./types";
import { ASSERTION_TYPES } from "./validate";

/** `{ assertions: Assertion[] }` — the `type` enum is locked to the closed
 *  vocabulary; validation drops anything off-vocabulary. */
const assertionsSchema = {
  type: "object",
  required: ["assertions"],
  properties: {
    assertions: {
      type: "array",
      items: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: [...ASSERTION_TYPES] },
          expected: {},
          name: { type: "string" },
          path: { type: "string" },
          substring: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          max_ms: { type: "number" },
          expected_type: { type: "string" },
        },
      },
    },
  },
} as const;

/** The subset of StoredRequest the model may fill; id/collection_id/sort_order
 *  are assigned by the FE, never the model. */
const requestSchema = {
  type: "object",
  required: ["method", "url"],
  properties: {
    method: { type: "string" },
    url: { type: "string" },
    headers: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "value"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    body_text: { type: "string" },
  },
} as const;

/** A GraphQL query string (+ optional vars) → folded into GraphqlMeta and
 *  parsed against the LOCAL schema before it lands. */
const graphqlSchema = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string" },
    variables_json: { type: "string" },
  },
} as const;

/** A single constrained Markdown field — even explain/document is a bounded
 *  artifact, not an open conversation. */
const markdownSchema = {
  type: "object",
  required: ["markdown"],
  properties: { markdown: { type: "string" } },
} as const;

/** The Ollama `format` schema for a given action. */
export function schemaFor(action: AiActionKind): unknown {
  switch (action) {
    case "generate-assertions":
      return assertionsSchema;
    case "nl-to-request":
      return requestSchema;
    case "nl-to-graphql":
      return graphqlSchema;
    case "explain-error":
    case "document-request":
      return markdownSchema;
  }
}
