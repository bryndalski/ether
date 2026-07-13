import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SidebarHeader } from "./SidebarHeader";

afterEach(cleanup);

describe("SidebarHeader", () => {
  it("applies the .sidebar-search-input class and a search-labelled input", () => {
    render(<SidebarHeader query="" onQueryChange={vi.fn()} />);
    const input = screen.getByLabelText("Search requests");
    expect(input).toHaveClass("sidebar-search-input");
    expect(input).toHaveAttribute("type", "search");
  });

  it("keeps the search icon decorative (aria-hidden) alongside the input", () => {
    const { container } = render(
      <SidebarHeader query="" onQueryChange={vi.fn()} />,
    );
    const icon = container.querySelector(".sidebar-search-icon");
    expect(icon).toHaveAttribute("aria-hidden");
    expect(screen.getByLabelText("Search requests")).toBeInTheDocument();
  });
});
