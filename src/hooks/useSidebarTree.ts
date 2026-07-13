// Ephemeral view state for the collections sidebar: which folders are expanded,
// which row's context menu / rename is open, and the search query. All DATA
// mutations delegate to useCollectionsStore — this hook holds no request state.

import { useCallback, useMemo, useState } from "react";
import { useCollectionsStore } from "../state/useCollectionsStore";
import {
  buildTree,
  EMPTY_SIDEBAR_FILTERS,
  filtersActive,
  filterTree,
  matchingCollectionIds,
  type CollectionTreeResult,
  type SidebarFilters,
} from "../lib/collectionTree";

export interface SidebarTreeApi {
  tree: CollectionTreeResult;
  query: string;
  setQuery: (query: string) => void;
  filters: SidebarFilters;
  toggleMethod: (method: string) => void;
  setType: (type: SidebarFilters["type"]) => void;
  clearFilters: () => void;
  filtersActive: boolean;
  resultCount: number;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  menuFor: string | null;
  openMenu: (id: string) => void;
  closeMenu: () => void;
  renamingId: string | null;
  startRename: (id: string) => void;
  cancelRename: () => void;
}

function countRequests(tree: CollectionTreeResult): number {
  let total = tree.orphanRequests.length;
  function walk(node: { children: unknown[]; requests: unknown[] }): void {
    total += node.requests.length;
    (node.children as { children: unknown[]; requests: unknown[] }[]).forEach(
      walk,
    );
  }
  tree.roots.forEach((node) => walk(node));
  return total;
}

export function useSidebarTree(): SidebarTreeApi {
  const collections = useCollectionsStore((state) => state.collections);
  const requests = useCollectionsStore((state) => state.requests);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SidebarFilters>(EMPTY_SIDEBAR_FILTERS);
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const fullTree = useMemo(
    () => buildTree(collections, requests),
    [collections, requests],
  );
  const tree = useMemo(
    () => filterTree(fullTree, query, filters),
    [fullTree, query, filters],
  );

  const active = filtersActive(filters);
  const filtering = query.trim() !== "" || active;
  const resultCount = useMemo(
    () => (filtering ? countRequests(tree) : countRequests(fullTree)),
    [filtering, tree, fullTree],
  );

  const toggleMethod = useCallback((method: string) => {
    const upper = method.toUpperCase();
    setFilters((prev) => ({
      ...prev,
      methods: prev.methods.includes(upper)
        ? prev.methods.filter((m) => m !== upper)
        : [...prev.methods, upper],
    }));
  }, []);

  const setType = useCallback((type: SidebarFilters["type"]) => {
    setFilters((prev) => ({ ...prev, type }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_SIDEBAR_FILTERS);
    setQuery("");
  }, []);

  // While searching/filtering, auto-expand every folder that has a match so hits
  // are visible; otherwise honor manual expansion (roots default open).
  const searchExpanded = useMemo(
    () => (filtering ? new Set(matchingCollectionIds(tree)) : null),
    [filtering, tree],
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
    filters,
    toggleMethod,
    setType,
    clearFilters,
    filtersActive: active,
    resultCount,
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
