import { describe, expect, it } from "vitest";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  COMMON_HEADER_NAMES,
  CONTENT_TYPE_VALUES,
  contentTypeValueCompletionSource,
  headerNameCompletionSource,
} from "./headerCatalog";

function run(
  source: ReturnType<typeof headerNameCompletionSource>,
  doc: string,
): CompletionResult | null {
  const state = EditorState.create({ doc });
  const context = new CompletionContext(state, doc.length, false);
  return source(context) as CompletionResult | null;
}

describe("headerNameCompletionSource", () => {
  const source = headerNameCompletionSource();

  it("includes the common header names", () => {
    expect(COMMON_HEADER_NAMES).toContain("Content-Type");
    expect(COMMON_HEADER_NAMES).toContain("Authorization");
    expect(COMMON_HEADER_NAMES).toContain("X-Request-Id");
  });

  it("matches case-insensitively with startsWith boosted first", () => {
    const labels = run(source, "auth")?.options.map((o) => o.label);
    expect(labels?.[0]).toBe("Authorization");
  });
});

describe("contentTypeValueCompletionSource", () => {
  it("is active only when the header name is content-type (case-insensitive)", () => {
    const active = contentTypeValueCompletionSource(() => "Content-Type");
    const inactive = contentTypeValueCompletionSource(() => "X-Api-Key");
    expect(run(active, "app")?.options.map((o) => o.label)).toContain("application/json");
    expect(run(inactive, "app")).toBeNull();
  });

  it("stays silent inside an open {{ so it does not fight variable completion", () => {
    const active = contentTypeValueCompletionSource(() => "content-type");
    expect(run(active, "{{env.")).toBeNull();
  });

  it("offers the full MIME list for an empty prefix", () => {
    const active = contentTypeValueCompletionSource(() => "content-type");
    const labels = run(active, "")?.options.map((o) => o.label);
    expect(labels).toEqual([...CONTENT_TYPE_VALUES].sort());
  });
});
