// Display-only mirror of Rust's env resolution precedence: walk the parent
// chain (base → … → this env) folding `variables` with the child overriding
// the parent by name; union `secret_names` across the chain. This is NEVER the
// source of truth for a real send (Rust does the real merge + Keychain fetch);
// it only feeds the QuickLook preview.

import type { Environment } from "./types";

export interface MergedVar {
  name: string;
  value: string;
  isSecret: boolean;
  source: "own" | "inherited";
}

/** Ordered chain from the base ancestor down to `envId` (base first). A visited
 *  set guards a malformed/cyclic parent_id chain. */
function chainToRoot(all: Environment[], envId: string): Environment[] {
  const byId = new Map(all.map((environment) => [environment.id, environment]));
  const chain: Environment[] = [];
  const visited = new Set<string>();
  let current = byId.get(envId) ?? null;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }
  return chain.reverse(); // base first, target last
}

/** Merged public variables + secret names for `envId`, child overriding parent
 *  by name, secret names unioned across the chain. Rows contributed by an
 *  ancestor are tagged `inherited`. */
export function mergedVars(all: Environment[], envId: string): MergedVar[] {
  const chain = chainToRoot(all, envId);
  if (chain.length === 0) return [];

  const targetId = chain[chain.length - 1].id;
  const secretNames = new Set<string>();
  for (const environment of chain) {
    for (const name of environment.secret_names) secretNames.add(name);
  }

  // Fold variables base→target so later (child) entries override earlier ones;
  // remember the last environment that contributed each name for the source tag.
  const byName = new Map<string, { value: string; ownerId: string }>();
  for (const environment of chain) {
    for (const variable of environment.variables) {
      byName.set(variable.name, {
        value: variable.value,
        ownerId: environment.id,
      });
    }
  }

  const result: MergedVar[] = [];
  for (const [name, { value, ownerId }] of byName) {
    const isSecret = secretNames.has(name);
    result.push({
      name,
      value: isSecret ? "" : value,
      isSecret,
      source: ownerId === targetId ? "own" : "inherited",
    });
  }

  // Secret-only names (no public variable) still surface as masked rows.
  for (const name of secretNames) {
    if (!byName.has(name)) {
      const ownedHere = chain[chain.length - 1].secret_names.includes(name);
      result.push({
        name,
        value: "",
        isSecret: true,
        source: ownedHere ? "own" : "inherited",
      });
    }
  }

  return result;
}
