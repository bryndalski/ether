// Pure drop math for drag & drop reorder. Renumbers the affected sibling group
// to a dense 0..n-1 sequence (deterministic, testable) rather than fractional
// keys, and returns only the items whose sort_order actually changed.

export interface SortableEntity {
  id: string;
  sort_order: number;
}

/** Move `draggedId` to `targetIndex` within its sibling list and renumber the
 *  whole group densely. Returns the minimal set `{ id, sort_order }` whose
 *  sort_order changed (so the store persists only what moved). */
export function reorderSiblings<T extends SortableEntity>(
  siblings: T[],
  draggedId: string,
  targetIndex: number,
): { id: string; sort_order: number }[] {
  const fromIndex = siblings.findIndex((item) => item.id === draggedId);
  if (fromIndex === -1) return [];

  const ordered = [...siblings];
  const [dragged] = ordered.splice(fromIndex, 1);
  const clampedTarget = Math.max(0, Math.min(targetIndex, ordered.length));
  ordered.splice(clampedTarget, 0, dragged);

  const changed: { id: string; sort_order: number }[] = [];
  ordered.forEach((item, index) => {
    if (item.sort_order !== index) {
      changed.push({ id: item.id, sort_order: index });
    }
  });
  return changed;
}
