// Pure builders that turn the two flat store lists (collections + requests)
// into a render tree, and filter that tree by a search query. No React, no
// Tauri — unit-tested in isolation.

import type { Collection, StoredRequest } from "./types";

export interface TreeNode {
  collection: Collection;
  children: TreeNode[];
  requests: StoredRequest[];
}

export interface CollectionTreeResult {
  roots: TreeNode[];
  orphanRequests: StoredRequest[];
}

function bySortThenName<T extends { sort_order: number; name: string }>(
  a: T,
  b: T,
): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

/** Build a nested tree keyed by `parent_id`. Requests whose `collection_id`
 *  matches no collection surface as `orphanRequests` (kept ungrouped, forgiving
 *  behavior). A visited-set guards a malformed `parent_id` chain so a cycle
 *  never causes an infinite loop. */
export function buildTree(
  collections: Collection[],
  requests: StoredRequest[],
): CollectionTreeResult {
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const childrenByParent = new Map<string, Collection[]>();
  for (const collection of collections) {
    const key = collection.parent_id ?? "\0root";
    const bucket = childrenByParent.get(key) ?? [];
    bucket.push(collection);
    childrenByParent.set(key, bucket);
  }

  const requestsByCollection = new Map<string, StoredRequest[]>();
  for (const request of requests) {
    const bucket = requestsByCollection.get(request.collection_id) ?? [];
    bucket.push(request);
    requestsByCollection.set(request.collection_id, bucket);
  }

  const visited = new Set<string>();

  function build(collection: Collection): TreeNode {
    visited.add(collection.id);
    const rawChildren = childrenByParent.get(collection.id) ?? [];
    const children = rawChildren
      .filter((child) => !visited.has(child.id))
      .sort(bySortThenName)
      .map(build);
    const nodeRequests = [
      ...(requestsByCollection.get(collection.id) ?? []),
    ].sort(bySortThenName);
    return { collection, children, requests: nodeRequests };
  }

  const roots = (childrenByParent.get("\0root") ?? [])
    .sort(bySortThenName)
    .map(build);

  const orphanRequests = requests.filter(
    (request) => !collectionIds.has(request.collection_id),
  );

  return { roots, orphanRequests };
}

function requestMatches(request: StoredRequest, needle: string): boolean {
  return (
    request.name.toLowerCase().includes(needle) ||
    request.method.toLowerCase().includes(needle) ||
    request.url.toLowerCase().includes(needle)
  );
}

/** Keep only nodes whose subtree matches the query (request name / method /
 *  url substring, case-insensitive). Matching branches are returned intact so
 *  the caller auto-expands them; an empty query passes the tree through. */
export function filterTree(
  tree: CollectionTreeResult,
  query: string,
): CollectionTreeResult {
  const needle = query.trim().toLowerCase();
  if (needle === "") return tree;

  function filterNode(node: TreeNode): TreeNode | null {
    const children = node.children
      .map(filterNode)
      .filter((child): child is TreeNode => child !== null);
    const requests = node.requests.filter((request) =>
      requestMatches(request, needle),
    );
    const nameMatches = node.collection.name.toLowerCase().includes(needle);
    if (children.length === 0 && requests.length === 0 && !nameMatches) {
      return null;
    }
    return { collection: node.collection, children, requests };
  }

  return {
    roots: tree.roots
      .map(filterNode)
      .filter((node): node is TreeNode => node !== null),
    orphanRequests: tree.orphanRequests.filter((request) =>
      requestMatches(request, needle),
    ),
  };
}

/** Ids of every collection that has any matching descendant — used to
 *  auto-expand folders while a search is active. */
export function matchingCollectionIds(filtered: CollectionTreeResult): string[] {
  const ids: string[] = [];
  function walk(node: TreeNode): void {
    ids.push(node.collection.id);
    node.children.forEach(walk);
  }
  filtered.roots.forEach(walk);
  return ids;
}

/** Every collection id in the subtree rooted at `id` (inclusive) — the FE
 *  mirrors a full-subtree delete so the tree never shows orphans. */
export function descendantCollectionIds(
  collections: Collection[],
  id: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const collection of collections) {
    if (collection.parent_id === null) continue;
    const bucket = childrenByParent.get(collection.parent_id) ?? [];
    bucket.push(collection.id);
    childrenByParent.set(collection.parent_id, bucket);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}
