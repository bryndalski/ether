import { describe, expect, it } from "vitest";
import { buildSchema, parse, print } from "graphql";
import {
  applyFieldSkeletonToQuery,
  applySelectionToQuery,
  defaultOperation,
  deriveSelection,
  sameOperation,
} from "./graphqlSelection";

describe("applySelectionToQuery (tree -> query)", () => {
  it("adds a top-level field to an empty operation", () => {
    const out = applySelectionToQuery(defaultOperation("query"), "query", ["user"], true);
    expect(out).toContain("user");
    // parseable and structurally an operation
    expect(() => parse(out)).not.toThrow();
  });

  it("nests a child field under its parent", () => {
    let q = applySelectionToQuery(defaultOperation("query"), "query", ["user"], true);
    q = applySelectionToQuery(q, "query", ["user", "id"], true);
    expect(q).toMatch(/user\s*{[\s\S]*id[\s\S]*}/);
  });

  it("toggling a field off removes it", () => {
    let q = applySelectionToQuery("query { user }", "query", ["user"], false);
    expect(deriveSelection(q, "query").has("user")).toBe(false);
  });

  it("removing the last child prunes the now-empty parent selection", () => {
    let q = "query {\n  user {\n    id\n  }\n}";
    q = applySelectionToQuery(q, "query", ["user", "id"], false);
    const sel = deriveSelection(q, "query");
    expect(sel.has("user.id")).toBe(false);
    expect(sel.has("user")).toBe(false);
  });

  it("recovers from an unparseable query by starting fresh", () => {
    const q = applySelectionToQuery("query { user {", "query", ["user"], true);
    expect(() => parse(q)).not.toThrow();
    expect(deriveSelection(q, "query").has("user")).toBe(true);
  });

  it("routes fields to the matching operation type", () => {
    const q = applySelectionToQuery(defaultOperation("mutation"), "mutation", ["createUser"], true);
    expect(q).toContain("mutation");
    expect(deriveSelection(q, "mutation").has("createUser")).toBe(true);
  });
});

describe("deriveSelection (query -> checkboxes)", () => {
  it("collects every selected field path", () => {
    const sel = deriveSelection("query { user { id name } }", "query");
    expect(sel.has("user")).toBe(true);
    expect(sel.has("user.id")).toBe(true);
    expect(sel.has("user.name")).toBe(true);
  });

  it("returns the previous selection when the query is mid-typing (invalid)", () => {
    const prev = new Set(["user", "user.id"]);
    expect(deriveSelection("query { user { id", "query", prev)).toBe(prev);
  });

  it("only reports fields of the requested operation type", () => {
    const doc = "query { a } mutation { b }";
    expect(deriveSelection(doc, "query").has("a")).toBe(true);
    expect(deriveSelection(doc, "query").has("b")).toBe(false);
    expect(deriveSelection(doc, "mutation").has("b")).toBe(true);
  });
});

describe("applyFieldSkeletonToQuery (schema-driven pick)", () => {
  const schema = buildSchema(`
    type User { id: ID! name: String friends: [User!] }
    type Query { user(id: ID!, verbose: Boolean): User me: User }
    type Mutation { createUser(name: String!): User! }
  `);

  it("adds required args as $var placeholders and first-level scalars", () => {
    const out = applyFieldSkeletonToQuery(
      defaultOperation("query"),
      "query",
      schema,
      "user",
    );
    expect(() => parse(out)).not.toThrow();
    // required arg -> variable placeholder + var definition in the header
    expect(out).toContain("$id");
    expect(out).toMatch(/query\s*\(\$id: ID!\)/);
    // optional arg (verbose) is omitted
    expect(out).not.toContain("verbose");
    // first-level scalar leaves are seeded; nested object (friends) is not
    const sel = deriveSelection(out, "query");
    expect(sel.has("user.id")).toBe(true);
    expect(sel.has("user.name")).toBe(true);
    expect(sel.has("user.friends")).toBe(false);
  });

  it("mutations get the same skeleton treatment", () => {
    const out = applyFieldSkeletonToQuery(
      defaultOperation("mutation"),
      "mutation",
      schema,
      "createUser",
    );
    expect(() => parse(out)).not.toThrow();
    expect(out).toMatch(/mutation\s*\(\$name: String!\)/);
    expect(deriveSelection(out, "mutation").has("createUser.id")).toBe(true);
  });

  it("is idempotent for an already-present field", () => {
    const once = applyFieldSkeletonToQuery(
      defaultOperation("query"),
      "query",
      schema,
      "me",
    );
    const twice = applyFieldSkeletonToQuery(once, "query", schema, "me");
    expect(twice).toBe(once);
  });
});

describe("sameOperation (loop guard)", () => {
  it("treats whitespace-only differences as the same operation", () => {
    const a = "query { user { id } }";
    const b = print(parse(a)) + "\n\n  ";
    expect(sameOperation(a, b)).toBe(true);
  });

  it("detects a real structural change", () => {
    expect(sameOperation("query { user { id } }", "query { user { id name } }")).toBe(false);
  });
});
