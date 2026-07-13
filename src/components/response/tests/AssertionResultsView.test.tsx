import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssertionResultsView } from "./AssertionResultsView";
import type { Assertion, ResponseData } from "../../../lib/types";

afterEach(cleanup);

function response(): ResponseData {
  return {
    request_id: "r1",
    status: 200,
    http_version: "2",
    headers: [{ name: "Content-Type", value: "application/json", enabled: true }],
    body: JSON.stringify({ id: 1 }),
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 8,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 5 },
    effective_url: "https://api.test",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
  };
}

describe("AssertionResultsView", () => {
  it("shows pass and fail rows with sigil + word (never color-only)", () => {
    const assertions: Assertion[] = [
      { type: "status_equals", expected: 200, enabled: true },
      { type: "status_equals", expected: 500, enabled: true },
    ];
    render(<AssertionResultsView response={response()} assertions={assertions} />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    // sigils present alongside words
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✗")).toBeInTheDocument();
  });

  it("renders an accessible aria-label for a passing assertion", () => {
    render(
      <AssertionResultsView
        response={response()}
        assertions={[{ type: "status_equals", expected: 200, enabled: true }]}
      />,
    );
    expect(
      screen.getByLabelText("Assertion passed: status = 200"),
    ).toBeInTheDocument();
  });

  it("shows expected-vs-actual on failure", () => {
    render(
      <AssertionResultsView
        response={response()}
        assertions={[{ type: "status_equals", expected: 201, enabled: true }]}
      />,
    );
    expect(screen.getByText(/expected 201/)).toBeInTheDocument();
    expect(screen.getByText(/got 200/)).toBeInTheDocument();
  });
});
