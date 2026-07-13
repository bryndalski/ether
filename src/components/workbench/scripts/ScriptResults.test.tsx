import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScriptResults } from "./ScriptResults";
import type { ScriptOutcome } from "../../../lib/scripts";

afterEach(cleanup);

const base: ScriptOutcome = {
  ok: true,
  logs: [],
  env_set: [],
  tests: [],
};

describe("ScriptResults", () => {
  it("shows the not-run hint when there is no outcome", () => {
    render(<ScriptResults outcome={null} />);
    expect(
      screen.getByText(/Run the script to see console output/i),
    ).toBeInTheDocument();
  });

  it("renders captured console logs", () => {
    render(<ScriptResults outcome={{ ...base, logs: ["hello 42"] }} />);
    expect(screen.getByText("hello 42")).toBeInTheDocument();
  });

  it("renders a passing and a failing test row", () => {
    const outcome: ScriptOutcome = {
      ...base,
      tests: [
        { name: "status ok", passed: true },
        { name: "has token", passed: false },
      ],
    };
    render(<ScriptResults outcome={outcome} />);
    const pass = screen.getByText("status ok").closest(".script-test");
    const fail = screen.getByText("has token").closest(".script-test");
    expect(pass).toHaveClass("pass");
    expect(fail).toHaveClass("fail");
  });

  it("shows the error banner when ok is false", () => {
    const outcome: ScriptOutcome = {
      ...base,
      ok: false,
      error: "script step limit (5000000) exceeded",
    };
    render(<ScriptResults outcome={outcome} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(/step limit/i);
  });

  it("lists variables set by the script", () => {
    render(<ScriptResults outcome={{ ...base, env_set: [["token", "T-9"]] }} />);
    expect(screen.getByText("token")).toBeInTheDocument();
    expect(screen.getByText("T-9")).toBeInTheDocument();
  });
});
