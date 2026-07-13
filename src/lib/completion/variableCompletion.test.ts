import { describe, expect, it } from "vitest";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { variableCompletionSource } from "./variableCompletion";
import type { VarCandidate } from "./variableCandidates";

const CANDIDATES: VarCandidate[] = [
  { insert: "{{env.host}}", label: "env.host", kind: "env", detail: "api.example.com", boost: 0, isSnippet: false },
  { insert: "{{secret.API_KEY}}", label: "secret.API_KEY", kind: "secret", detail: "secret", boost: -10, isSnippet: false },
  { insert: "{{secret.BAD}}", label: "secret.BAD", kind: "secret", detail: "secret", boost: -10, isSnippet: false },
  { insert: "{{$uuid}}", label: "$uuid", kind: "dynamic", detail: "random UUID v4", boost: -20, isSnippet: false },
  { insert: "{{$random.int(${1:0},${2:9})}}", label: "$random.int(a,b)", kind: "dynamic", detail: "random integer in [a,b]", boost: -20, isSnippet: true },
];

const source = variableCompletionSource(() => CANDIDATES);

/** Run the source against `doc` with the caret at the end. */
function run(doc: string): CompletionResult | null {
  const state = EditorState.create({ doc });
  const context = new CompletionContext(state, doc.length, false);
  return source(context) as CompletionResult | null;
}

describe("variableCompletionSource", () => {
  it("returns null outside an open {{ and options once {{ is typed", () => {
    expect(run("foo ")).toBeNull();
    expect(run("{ single brace")).toBeNull();
    const opened = run("foo {{");
    expect(opened).not.toBeNull();
    expect(opened?.options.length).toBe(CANDIDATES.length);
  });

  it("is silent when the token is already closed", () => {
    expect(run("{{env.host}} and more")).toBeNull();
  });

  it("filters by prefix against the namespaced label", () => {
    expect(run("{{en")?.options.map((o) => o.label)).toEqual(["env.host"]);
    expect(run("{{$ra")?.options.map((o) => o.label)).toEqual(["$random.int(a,b)"]);
    const secrets = run("{{secret.A")?.options.map((o) => o.label);
    expect(secrets).toEqual(["secret.API_KEY"]);
  });

  it("replaces from the {{ so accepting yields exactly one set of braces", () => {
    const result = run("{{env.h");
    expect(result).not.toBeNull();
    const state = EditorState.create({ doc: "{{env.h" });
    const from = result!.from;
    const applied =
      state.doc.sliceString(0, from) + "{{env.host}}"; // apply is the insert string
    expect(applied).toBe("{{env.host}}");
    // the option's apply carries its own braces
    const option = result!.options.find((o) => o.label === "env.host");
    expect(option?.apply).toBe("{{env.host}}");
  });

  it("secret options carry the label string as detail, never a value", () => {
    const secret = run("{{secret.API")?.options[0];
    expect(secret?.detail).toBe("secret");
    expect(String(secret?.apply)).toBe("{{secret.API_KEY}}");
  });

  it("uses a snippet apply function for arg-taking dynamics", () => {
    const dyn = run("{{$random")?.options.find((o) => o.label === "$random.int(a,b)");
    // snippet() returns a function; plain inserts are strings
    expect(typeof dyn?.apply).toBe("function");
    const plain = run("{{$uuid")?.options.find((o) => o.label === "$uuid");
    expect(typeof plain?.apply).toBe("string");
  });
});
