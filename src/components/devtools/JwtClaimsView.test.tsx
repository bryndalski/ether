import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { JwtClaimsView } from "./JwtClaimsView";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

const HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
// exp far in the future → "Ważny".
const VALID_PAYLOAD =
  "eyJzdWIiOiIxMjMiLCJleHAiOjIwMDAwMDAwMDB9";
// exp in the past → "Wygasł".
const EXPIRED_PAYLOAD = "eyJzdWIiOiIxMjMiLCJleHAiOjEwMDAwMDAwMDB9";
const VALID_TOKEN = `${HEADER}.${VALID_PAYLOAD}.sig-secret-value`;
const EXPIRED_TOKEN = `${HEADER}.${EXPIRED_PAYLOAD}.sig-secret-value`;

afterEach(() => {
  mockInvoke.mockReset();
});

describe("JwtClaimsView", () => {
  it("always shows the unverified-signature banner", () => {
    render(<JwtClaimsView token={VALID_TOKEN} />);
    expect(
      screen.getByText(/signature unverified/i),
    ).toBeInTheDocument();
  });

  it("shows the Ważny badge for a valid token", () => {
    render(<JwtClaimsView token={VALID_TOKEN} />);
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("shows the Wygasł badge for an expired token", () => {
    render(<JwtClaimsView token={EXPIRED_TOKEN} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("SECURITY: never logs the token and never fires an IPC call", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<JwtClaimsView token={VALID_TOKEN} />);
    const loggedToken = [...logSpy.mock.calls, ...errSpy.mock.calls]
      .flat()
      .some((arg) => typeof arg === "string" && arg.includes("sig-secret-value"));
    expect(loggedToken).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("copy button copies decoded JSON, not the raw token", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JwtClaimsView token={VALID_TOKEN} />);
    screen
      .getByRole("button", { name: /copy decoded json/i })
      .click();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    // Decoded JSON contains claims but NOT the raw token / signature.
    expect(copied).toContain('"sub"');
    expect(copied).not.toContain("sig-secret-value");
    expect(copied).not.toContain(VALID_TOKEN);
  });
});
