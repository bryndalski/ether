import { beforeEach, describe, expect, it, vi } from "vitest";
import { envKind, useEnvStore } from "./useEnvStore";
import type { Environment } from "../lib/types";

vi.mock("../lib/ipc", () => ({
  listEnvironments: vi.fn(),
  getActiveEnvironmentId: vi.fn(),
  setActiveEnvironment: vi.fn(() => Promise.resolve()),
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
    useEnvStore.setState({
      environments: [makeEnv("e1", "local"), makeEnv("e2", "prod")],
      activeEnvironmentId: "e1",
      loading: false,
      loadFailed: false,
    });
  });

  it("switches the active environment", async () => {
    expect(useEnvStore.getState().activeEnvironmentId).toBe("e1");
    await useEnvStore.getState().switchEnvironment("e2");
    expect(useEnvStore.getState().activeEnvironmentId).toBe("e2");
    expect(useEnvStore.getState().activeEnvironment()?.name).toBe("prod");
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
