// The docs-explorer breadcrumb stack (Query > User > Role). Focusing a type
// pushes it; navigating an ancestor pops back to it. Opening the explorer seeds
// the root Query type.

import { useCallback, useEffect, useState } from "react";

export interface DocsNav {
  stack: string[];
  focus: string | null;
  focusType: (typeName: string) => void;
  navigateTo: (index: number) => void;
  reset: (rootTypeName: string | null) => void;
}

export function useDocsNav(rootTypeName: string | null): DocsNav {
  const [stack, setStack] = useState<string[]>(rootTypeName ? [rootTypeName] : []);

  // Reseed when the schema's root type changes (e.g. op-type switch).
  useEffect(() => {
    setStack(rootTypeName ? [rootTypeName] : []);
  }, [rootTypeName]);

  const focusType = useCallback((typeName: string) => {
    setStack((prev) => {
      if (prev[prev.length - 1] === typeName) return prev;
      return [...prev, typeName];
    });
  }, []);

  const navigateTo = useCallback((index: number) => {
    setStack((prev) => prev.slice(0, index + 1));
  }, []);

  const reset = useCallback((name: string | null) => {
    setStack(name ? [name] : []);
  }, []);

  return {
    stack,
    focus: stack.length > 0 ? stack[stack.length - 1] : null,
    focusType,
    navigateTo,
    reset,
  };
}
