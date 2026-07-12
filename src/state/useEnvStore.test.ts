import { beforeEach, describe, expect, it, vi } from "vitest";
import { envKind, useEnvStore } from "./useEnvStore";
import type { Environment } from "../lib/types";

const setActiveEnvironment = vi.fn((_id: string | null) => Promise.resolve());
const upsertEnvironment = vi.fn((environment: Environment) =>
  Promise.resolve(environment),
);
const deleteEnvironment = vi.fn((_id: string) => Promise.resolve());

vi.mock("../lib/ipc", () => ({
  listEnvironments: vi.fn(),
  getActiveEnvironmentId: vi.fn(),
  setActiveEnvironment: (id: string | null) => setActiveEnvironment(id),
  upsertEnvironment: (environment: Environment) =>
    upsertEnvironment(environment),
  deleteEnvironment: (id: string) => deleteEnvironment(id),
}));

function makeEnv(id: string, name: string): Environment {
  return {
    id,
    name,
    parent_id: null,
    color: null,
    variables: [],
    secret_names: [],
  };
}

describe("useEnvStore", () => {
  beforeEach(() => {
    setActiveEnvironment.mockClear();
    upsertEnvironment.mockClear();
    upsertEnvironment.mockImplementation((environment) =>
      Promise.resolve(environment),
    );
    deleteEnvironment.mockClear();
    deleteEnvironment.mockImplementation(() => Promise.resolve());
    useEnvStore.setState({
      environments: [makeEnv("e1", "local"), makeEnv("e2", "prod")],
      activeEnvironmentId: "e1",
      loading: false,
      loadFailed: false,
    });
  });

  it("switches the active environment and calls set_active_environment", async () => {
    expect(useEnvStore.getState().activeEnvironmentId).toBe("e1");
    await useEnvStore.getState().switchEnvironment("e2");
    expect(useEnvStore.getState().activeEnvironmentId).toBe("e2");
    expect(useEnvStore.getState().activeEnvironment()?.name).toBe("prod");
    expect(setActiveEnvironment).toHaveBeenCalledWith("e2");
  });

  it("createEnvironment pushes optimistically and upserts with parent_id", async () => {
    const id = await useEnvStore.getState().createEnvironment(null);
    const created = useEnvStore
      .getState()
      .environments.find((environment) => environment.id === id)!;
    expect(created.parent_id).toBeNull();
    expect(upsertEnvironment.mock.calls[0][0].id).toBe(id);
  });

  it("patchEnvironment merges the partial and upserts the merged env", async () => {
    await useEnvStore
      .getState()
      .patchEnvironment("e1", {
        variables: [{ name: "host", value: "api", enabled: true }],
      });
    const patched = useEnvStore.getState().activeEnvironment()!;
    expect(patched.variables).toHaveLength(1);
    expect(upsertEnvironment.mock.calls[0][0].variables).toHaveLength(1);
  });

  it("removeEnvironment deletes and clears active when it was active", async () => {
    await useEnvStore.getState().removeEnvironment("e1");
    const state = useEnvStore.getState();
    expect(state.environments.map((e) => e.id)).toEqual(["e2"]);
    expect(state.activeEnvironmentId).toBeNull();
    expect(deleteEnvironment).toHaveBeenCalledWith("e1");
    expect(setActiveEnvironment).toHaveBeenCalledWith(null);
  });

  it("rolls back env CRUD on IPC reject", async () => {
    upsertEnvironment.mockRejectedValueOnce("boom");
    await useEnvStore.getState().createEnvironment(null);
    expect(useEnvStore.getState().environments.map((e) => e.id)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("mergedActiveVars mirrors the pure merge for the active env", async () => {
    useEnvStore.setState({
      environments: [
        {
          id: "base",
          name: "base",
          parent_id: null,
          color: null,
          variables: [{ name: "host", value: "api.base", enabled: true }],
          secret_names: ["TOKEN"],
        },
        {
          id: "sub",
          name: "sub",
          parent_id: "base",
          color: null,
          variables: [{ name: "host", value: "api.sub", enabled: true }],
          secret_names: [],
        },
      ],
      activeEnvironmentId: "sub",
    });
    const merged = useEnvStore.getState().mergedActiveVars();
    const host = merged.find((v) => v.name === "host")!;
    expect(host.value).toBe("api.sub");
    const token = merged.find((v) => v.name === "TOKEN")!;
    expect(token.isSecret).toBe(true);
    expect(token.value).toBe("");
  });

  it("derives the active env kind for accent coloring", async () => {
    await useEnvStore.getState().switchEnvironment("e2");
    expect(useEnvStore.getState().activeKind()).toBe("prod");
  });

  it("infers env kind from name when color is unset", () => {
    expect(envKind(makeEnv("x", "staging-eu"))).toBe("staging");
    expect(envKind(makeEnv("x", "my dev box"))).toBe("dev");
    expect(envKind(makeEnv("x", "whatever"))).toBe("custom");
    expect(envKind(null)).toBe("local");
  });
});
