// Local expansion state for the schema field tree: a set of expanded path-keys.
// Expansion is user-driven (not persisted with the request), so it lives here in
// the tree, separate from the draft/selection.

import { useCallback, useState } from "react";
import { pathKey, type FieldPath } from "../lib/graphqlSelection";

export interface FieldTreeExpansion {
  isExpanded: (path: FieldPath) => boolean;
  toggleExpand: (path: FieldPath) => void;
}

export function useFieldTreeExpansion(): FieldTreeExpansion {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isExpanded = useCallback(
    (path: FieldPath) => expanded.has(pathKey(path)),
    [expanded],
  );

  const toggleExpand = useCallback((path: FieldPath) => {
    const key = pathKey(path);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return { isExpanded, toggleExpand };
}
