// Shallow "is the draft dirty vs the persisted request" check used to enable
// the Save affordance. A stable stringify (StoredRequest has no cyclic refs)
// is enough — the shape is small and fully JSON-serializable.

import type { StoredRequest } from "./types";

/** True when the edited draft diverges from the persisted request in any field
 *  (or when there is no persisted counterpart yet). */
export function isRequestDirty(
  draft: StoredRequest,
  persisted: StoredRequest | null,
): boolean {
  if (!persisted) return true;
  return JSON.stringify(draft) !== JSON.stringify(persisted);
}
