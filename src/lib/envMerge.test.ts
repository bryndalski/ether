import { describe, expect, it } from "vitest";
import { mergedVars } from "./envMerge";
import type { Environment } from "./types";

function env(
  id: string,
  parent_id: string | null,
  variables: [string, string][],
  secret_names: string[] = [],
): Environment {
  return {
    id,
    name: id,
    parent_id,
    color: null,
    variables: variables.map(([name, value]) => ({
      name,
      value,
      enabled: true,
    })),
    secret_names,
  };
}

describe("mergedVars", () => {
  it("returns own vars for a base env", () => {
    const all = [env("base", null, [["host", "api.local"]])];
    const merged = mergedVars(all, "base");
    expect(merged).toEqual([
      { name: "host", value: "api.local", isSecret: false, source: "own" },
    ]);
  });

  it("child overrides parent by name; inherited vars are tagged", () => {
    const all = [
      env("base", null, [
        ["host", "api.base"],
        ["region", "eu"],
      ]),
      env("sub", "base", [["host", "api.sub"]]),
    ];
    const merged = mergedVars(all, "sub");
    const byName = Object.fromEntries(merged.map((v) => [v.name, v]));
    expect(byName.host).toMatchObject({ value: "api.sub", source: "own" });
    expect(byName.region).toMatchObject({ value: "eu", source: "inherited" });
  });

  it("unions secret names across the chain and masks their value", () => {
    const all = [
      env("base", null, [], ["BASE_TOKEN"]),
      env("sub", "base", [], ["SUB_TOKEN"]),
    ];
    const merged = mergedVars(all, "sub");
    const names = merged.map((v) => v.name).sort();
    expect(names).toEqual(["BASE_TOKEN", "SUB_TOKEN"]);
    expect(merged.every((v) => v.isSecret && v.value === "")).toBe(true);
  });

  it("marks a public var as secret when a secret with the same name exists", () => {
    const all = [env("base", null, [["TOKEN", "leak-me"]], ["TOKEN"])];
    const merged = mergedVars(all, "base");
    expect(merged[0]).toMatchObject({ name: "TOKEN", isSecret: true, value: "" });
    // The secret value string must never survive the merge.
    expect(JSON.stringify(merged)).not.toContain("leak-me");
  });

  it("guards a cyclic parent_id chain", () => {
    const all = [
      env("x", "y", [["a", "1"]]),
      env("y", "x", [["b", "2"]]),
    ];
    // Should terminate and include both without looping forever.
    const merged = mergedVars(all, "x");
    expect(merged.map((v) => v.name).sort()).toEqual(["a", "b"]);
  });
});
