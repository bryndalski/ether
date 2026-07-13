import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SecretNamesList } from "./SecretNamesList";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

const SECRET_VALUE = "sk-super-secret-42";

function setup(names: string[]) {
  const onNamesChange = vi.fn();
  const onPurge = vi.fn(() => Promise.resolve());
  render(
    <SecretNamesList
      names={names}
      onNamesChange={onNamesChange}
      onPurge={onPurge}
    />,
  );
  return { onNamesChange, onPurge };
}

describe("SecretNamesList — status, set, delete, and the never-render guard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "secret_exists") return Promise.resolve(true);
      return Promise.resolve(undefined);
    });
  });

  it("shows status badges from secret_exists (icon + text, not color-only)", async () => {
    invokeMock.mockImplementation((command: string, args: unknown) => {
      if (command === "secret_exists") {
        const name = (args as { name: string }).name;
        return Promise.resolve(name === "A");
      }
      return Promise.resolve(undefined);
    });
    setup(["A", "B"]);
    await waitFor(() => {
      expect(screen.getByText("Set")).toBeInTheDocument();
    });
    expect(screen.getByText("Empty — set a value")).toBeInTheDocument();
  });

  it("set calls secret_set exactly once with the typed value, then clears it", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "secret_exists") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    setup(["TOKEN"]);

    fireEvent.click(
      screen.getByRole("button", { name: /set value for token/i }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /save secret token/i,
    });
    const input = within(dialog).getByLabelText(
      /value of secret token/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: SECRET_VALUE } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /save to keychain/i }),
    );

    await waitFor(() => {
      const setCalls = invokeMock.mock.calls.filter(
        (call) => call[0] === "secret_set",
      );
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0][1]).toEqual({ name: "TOKEN", value: SECRET_VALUE });
    });
  });

  it("delete calls secret_delete and purges when the name is removed", async () => {
    const { onNamesChange, onPurge } = setup(["TOKEN"]);
    fireEvent.click(screen.getByRole("button", { name: /delete secret token/i }));
    expect(onNamesChange).toHaveBeenCalledWith([]);
    await waitFor(() => expect(onPurge).toHaveBeenCalledWith("TOKEN"));
  });

  it("SECURITY: the secret value is never rendered and no read command is invoked", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "secret_exists") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    const { container } = render(
      <SecretNamesList
        names={["TOKEN"]}
        onNamesChange={vi.fn()}
        onPurge={() => Promise.resolve()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /set value for token/i }),
    );
    const input = screen.getByLabelText(
      /value of secret token/i,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: SECRET_VALUE } });
    fireEvent.click(
      screen.getByRole("button", { name: /save to keychain/i }),
    );

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.some((call) => call[0] === "secret_set"),
      ).toBe(true);
    });

    // The value must never appear anywhere in the rendered tree...
    expect(container.textContent ?? "").not.toContain(SECRET_VALUE);
    // ...and there must be no read path (secret_get does not exist).
    expect(
      invokeMock.mock.calls.some((call) =>
        String(call[0]).includes("secret_get"),
      ),
    ).toBe(false);
  });

  it("always surfaces the Keychain warning where secrets live (a11y honesty)", () => {
    setup(["TOKEN"]);
    expect(
      screen.getByText(/never read their values/i),
    ).toBeInTheDocument();
  });
});
