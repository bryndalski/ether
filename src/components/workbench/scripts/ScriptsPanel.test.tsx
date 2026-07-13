import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScriptsPanel } from "./ScriptsPanel";
import type { StoredRequest } from "../../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

afterEach(cleanup);

function draft(overrides: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: "r-1",
    collection_id: "c-1",
    name: "r",
    method: "GET",
    url: "https://api/x",
    headers: [],
    query_params: [],
    body: { type: "none" },
    auth: { type: "none" },
    options: {
      follow_redirects: true,
      max_redirects: 10,
      timeout_ms: 30_000,
      insecure: false,
      ca_bundle_path: null,
      compressed: true,
      cookie_jar: null,
    },
    sort_order: 0,
    docs_md: null,
    graphql: null,
    assertions: [],
    pre_script: null,
    post_script: null,
    ...overrides,
  };
}

const noOutcomes = { pre: null, post: null };

describe("ScriptsPanel", () => {
  it("starts on the Pre-request segment and switches to Tests", () => {
    render(
      <ScriptsPanel
        draft={draft()}
        environmentId={null}
        lastResponse={null}
        sendOutcomes={noOutcomes}
        onPreScriptChange={() => {}}
        onPostScriptChange={() => {}}
      />,
    );
    const pre = screen.getByRole("tab", { name: "Pre-request" });
    const post = screen.getByRole("tab", { name: "Tests" });
    expect(pre).toHaveAttribute("aria-selected", "true");
    fireEvent.click(post);
    expect(post).toHaveAttribute("aria-selected", "true");
    expect(pre).toHaveAttribute("aria-selected", "false");
  });

  it("shows the sandbox limit note (no network / fs / imports)", () => {
    render(
      <ScriptsPanel
        draft={draft()}
        environmentId={null}
        lastResponse={null}
        sendOutcomes={noOutcomes}
        onPreScriptChange={() => {}}
        onPostScriptChange={() => {}}
      />,
    );
    expect(
      screen.getByText(/no network, filesystem or imports/i),
    ).toBeInTheDocument();
  });

  it("disables Run on the post segment until a response exists", () => {
    render(
      <ScriptsPanel
        draft={draft()}
        environmentId={null}
        lastResponse={null}
        sendOutcomes={noOutcomes}
        onPreScriptChange={() => {}}
        onPostScriptChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tests" }));
    expect(screen.getByRole("button", { name: /Run/i })).toBeDisabled();
  });

  it("surfaces the last real-send outcome when the editor has not run", () => {
    render(
      <ScriptsPanel
        draft={draft()}
        environmentId={null}
        lastResponse={null}
        sendOutcomes={{
          pre: { ok: true, logs: ["from send"], env_set: [], tests: [] },
          post: null,
        }}
        onPreScriptChange={() => {}}
        onPostScriptChange={() => {}}
      />,
    );
    expect(screen.getByText("from send")).toBeInTheDocument();
  });
});
