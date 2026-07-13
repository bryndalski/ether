import { describe, expect, it } from "vitest";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { buildSchema } from "graphql";
import { graphql } from "cm6-graphql";
import { variableCompletionSource } from "./variableCompletion";
import type { VarCandidate } from "./variableCandidates";

const CANDIDATES: VarCandidate[] = [
  { insert: "{{env.userId}}", label: "env.userId", kind: "env", detail: "42", boost: 0, isSnippet: false },
];

const tokenSource = variableCompletionSource(() => CANDIDATES);

function tokenAt(doc: string, pos = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc });
  return tokenSource(new CompletionContext(state, pos, false)) as CompletionResult | null;
}

describe("GraphQL / {{...}} completion coexistence", () => {
  it("cm6-graphql attaches with a schema (schema autocomplete stays wired)", () => {
    // Regression guard for §3.1: constructing the extension with a real schema
    // must not throw — proves the schema-completion path is intact.
    const schema = buildSchema(`type Query { user(id: ID!): User } type User { id: ID! name: String }`);
    expect(() => graphql(schema)).not.toThrow();
    expect(() => graphql(undefined)).not.toThrow();
  });

  it("the {{...}} source is silent at a GraphQL field position", () => {
    // Caret after `user` — a schema field position, no open {{.
    expect(tokenAt("query { user")).toBeNull();
  });

  it("the {{...}} source fires inside a string argument's open {{", () => {
    const doc = 'query { user(id: "{{env.';
    const result = tokenAt(doc);
    expect(result).not.toBeNull();
    expect(result?.options.map((o) => o.label)).toEqual(["env.userId"]);
  });
});
