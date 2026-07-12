import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("colors 2xx with the success token and shows the reason (not color-only)", () => {
    render(<StatusBadge status={200} httpVersion="HTTP/2" />);
    const code = screen.getByText("200");
    expect(code.style.color).toBe("var(--lok-status-success)");
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("colors 4xx warn and 5xx danger", () => {
    const { rerender } = render(
      <StatusBadge status={404} httpVersion="HTTP/1.1" />,
    );
    expect(screen.getByText("404").style.color).toBe("var(--lok-status-warn)");
    expect(screen.getByText("Not Found")).toBeInTheDocument();

    rerender(<StatusBadge status={500} httpVersion="HTTP/1.1" />);
    expect(screen.getByText("500").style.color).toBe("var(--lok-status-danger)");
    expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
  });
});
