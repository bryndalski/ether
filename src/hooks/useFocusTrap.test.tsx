import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

function TrapHarness({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active: true, onClose });
  return (
    <div ref={ref} tabIndex={-1}>
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </div>
  );
}

afterEach(cleanup);

describe("useFocusTrap", () => {
  it("focuses the first focusable on activate", () => {
    render(<TrapHarness onClose={vi.fn()} />);
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("Tab from the last wraps to the first", () => {
    render(<TrapHarness onClose={vi.fn()} />);
    const last = screen.getByText("last");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("Shift+Tab from the first wraps to the last", () => {
    render(<TrapHarness onClose={vi.fn()} />);
    const first = screen.getByText("first");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(screen.getByText("last")).toHaveFocus();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<TrapHarness onClose={onClose} />);
    fireEvent.keyDown(screen.getByText("first"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the previously focused element on deactivate", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<TrapHarness onClose={vi.fn()} />);
    expect(screen.getByText("first")).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });
});
