import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeyValueValueCell } from "./KeyValueValueCell";

// Stub CodeMirror so the "lazy editor on focus" swap is observable without the
// real editor mounting.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => (
    <textarea data-testid="cm-editor" defaultValue={value} />
  ),
}));

afterEach(cleanup);

describe("KeyValueValueCell", () => {
  it("renders an idle display span with token pills and no editor until focus", () => {
    render(
      <KeyValueValueCell
        value="Bearer {{env.token}}"
        onChange={() => {}}
        getCandidates={() => []}
        ariaLabel="Value 1"
      />,
    );
    // idle: display button present, no CM editor
    expect(screen.getByRole("button", { name: "Value 1" })).toBeInTheDocument();
    expect(screen.queryByTestId("cm-editor")).toBeNull();
    // token is highlighted as a pill
    expect(screen.getByText("{{env.token}}")).toHaveClass("cm-lok-token");
  });

  it("swaps to the live editor on focus", () => {
    render(
      <KeyValueValueCell
        value="v"
        onChange={() => {}}
        getCandidates={() => []}
        ariaLabel="Value 1"
      />,
    );
    fireEvent.focus(screen.getByRole("button", { name: "Value 1" }));
    expect(screen.getByTestId("cm-editor")).toBeInTheDocument();
  });
});
