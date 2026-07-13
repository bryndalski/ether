import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SnippetHelp } from "./SnippetHelp";

afterEach(cleanup);

describe("SnippetHelp", () => {
  it("lists the lok surface for the pre phase and inserts a snippet on click", () => {
    const onInsert = vi.fn();
    render(<SnippetHelp phase="pre" onInsert={onInsert} />);
    // The pre snippets document lok.request / lok.env — never require/fetch.
    const snippet = screen.getByText(/lok\.request\.setHeader/);
    fireEvent.click(snippet);
    expect(onInsert).toHaveBeenCalledWith(
      expect.stringContaining("lok.request.setHeader"),
    );
    expect(screen.queryByText(/require\(/)).toBeNull();
    expect(screen.queryByText(/fetch\(/)).toBeNull();
  });

  it("lists response helpers for the post phase", () => {
    const onInsert = vi.fn();
    render(<SnippetHelp phase="post" onInsert={onInsert} />);
    expect(screen.getByText(/lok\.response\.json/)).toBeInTheDocument();
    expect(screen.getByText(/lok\.expect/)).toBeInTheDocument();
  });
});
