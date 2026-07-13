import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SingleLineCodeInput } from "./SingleLineCodeInput";

// CodeMirror is heavy in jsdom; stub it to a textarea that exposes the passed
// aria-label + value/onChange so we exercise the wrapper wiring without the
// real editor. Newline-blocking and completion are covered at the lib layer.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="cm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

afterEach(cleanup);

describe("SingleLineCodeInput", () => {
  it("renders with an accessible name and forwards edits", () => {
    const onChange = vi.fn();
    render(
      <SingleLineCodeInput
        value="https://x"
        onChange={onChange}
        getCandidates={() => []}
        ariaLabel="Request URL"
      />,
    );
    expect(screen.getByLabelText("Request URL")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("cm"), { target: { value: "https://y" } });
    expect(onChange).toHaveBeenCalledWith("https://y");
  });
});
