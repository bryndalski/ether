import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KeyValueTable } from "./KeyValueTable";
import type { KeyValue } from "../../lib/types";

afterEach(cleanup);

const rows: KeyValue[] = [
  { name: "Authorization", value: "Bearer x", enabled: true },
  { name: "Accept", value: "application/json", enabled: false },
];

describe("KeyValueTable", () => {
  it("toggling a checkbox flips enabled in the emitted rows", () => {
    const onChange = vi.fn();
    render(<KeyValueTable rows={rows} onChange={onChange} keyHeader="Header" />);
    fireEvent.click(screen.getByLabelText("Włącz Authorization"));
    expect(onChange).toHaveBeenCalledWith([
      { name: "Authorization", value: "Bearer x", enabled: false },
      rows[1],
    ]);
  });

  it("the remove button drops that row", () => {
    const onChange = vi.fn();
    render(<KeyValueTable rows={rows} onChange={onChange} keyHeader="Header" />);
    fireEvent.click(screen.getByLabelText("Usuń Accept"));
    expect(onChange).toHaveBeenCalledWith([rows[0]]);
  });

  it("editing the ghost row appends a new entry", () => {
    const onChange = vi.fn();
    render(<KeyValueTable rows={[]} onChange={onChange} keyHeader="Header" />);
    // the only key input present is the ghost row's
    fireEvent.change(screen.getByLabelText("Header 1"), {
      target: { value: "X-New" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { name: "X-New", value: "", enabled: true },
    ]);
  });

  it("exposes accessible names on the enable + remove controls", () => {
    render(<KeyValueTable rows={rows} onChange={() => {}} keyHeader="Header" />);
    expect(
      screen.getByRole("button", { name: "Usuń Authorization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Włącz Accept" }),
    ).toBeInTheDocument();
  });
});
