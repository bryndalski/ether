// Single source of id generation, extracted from useNewRequest so the sidebar
// CRUD actions and the new-request builder share one implementation.

/** Prefer the platform UUID; fall back to a time+random id in environments
 *  (older jsdom, non-secure contexts) that lack crypto.randomUUID. */
export function makeId(prefix = "id"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
