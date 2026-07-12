// Ephemeral view state for the collections sidebar: which folders are expanded,
// which row's context menu / rename is open, and the search query. All DATA
// mutations delegate to useCollectionsStore — this hook holds no request state.

import { useMemo, useState } from "react";
import { useCollectionsStore } from "../state/useCollectionsStore";
import {
  buildTree,
  filterTree,
  matchingCollectionIds,
  type CollectionTreeResult,
} from "../lib/collectionTree";

export interface SidebarTreeApi {
  tree: CollectionTreeResult;
  query: string;
  setQuery: (query: string) => void;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  menuFor: string | null;
  openMenu: (id: string) => void;
  closeMenu: () => void;
  renamingId: string | null;
  startRename: (id: string) => void;
  cancelRename: () => void;
}

export function useSidebarTree(): SidebarTreeApi {
  const collections = useCollectionsStore((state) => state.collections);
  const requests = useCollectionsStore((state) => state.requests);

  const [query, setQuery] = useState("");
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const fullTree = useMemo(
    () => buildTree(collections, requests),
    [collections, requests],
  );
  const tree = useMemo(() => filterTree(fullTree, query), [fullTree, query]);

  // While searching, auto-expand every folder that has a match so hits are
  // visible; otherwise honor manual expansion (roots default open).
  const searchExpanded = useMemo(
    () => (query.trim() ? new Set(matchingCollectionIds(tree)) : null),
    [query, tree],
  );
  const defaultRoots = useMemo(
    () => new Set(fullTree.roots.map((node) => node.collection.id)),
    [fullTree],
  );

  function isExpanded(id: string): boolean {
    if (searchExpanded) return searchExpanded.has(id);
    if (manualExpanded.has(`-${id}`)) return false; // explicitly collapsed
    return manualExpanded.has(id) || defaultRoots.has(id);
  }

  function toggle(id: string): void {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      const open = isExpanded(id);
      // Track collapse of a default-open root with a "-id" marker.
      next.delete(id);
      next.delete(`-${id}`);
      if (open) next.add(`-${id}`);
      else next.add(id);
      return next;
    });
  }

  return {
    tree,
    query,
    setQuery,
    isExpanded,
    toggle,
    menuFor,
    openMenu: setMenuFor,
    closeMenu: () => setMenuFor(null),
    renamingId,
    startRename: (id) => {
      setRenamingId(id);
      setMenuFor(null);
    },
    cancelRename: () => setRenamingId(null),
  };
}
