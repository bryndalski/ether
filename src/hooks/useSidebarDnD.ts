// Native HTML5 drag & drop capture for reordering requests. Library-agnostic:
// the drop math lives in the pure reorder helper and the persistence in the
// store's `reorder` action, so swapping in @dnd-kit later only touches here.

import { useState } from "react";
import { useCollectionsStore } from "../state/useCollectionsStore";
import { reorderSiblings } from "../lib/reorder";
import type { StoredRequest } from "../lib/types";

export interface SidebarDnDApi {
  draggingId: string | null;
  dropTargetId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (id: string) => void;
  onDropOnRow: (target: StoredRequest) => void;
}

export function useSidebarDnD(): SidebarDnDApi {
  const requests = useCollectionsStore((state) => state.requests);
  const reorder = useCollectionsStore((state) => state.reorder);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function onDropOnRow(target: StoredRequest) {
    const dragged = requests.find((request) => request.id === draggingId);
    setDraggingId(null);
    setDropTargetId(null);
    if (!dragged || dragged.id === target.id) return;

    const targetCollection = target.collection_id;
    const siblings = requests
      .filter((request) => request.collection_id === targetCollection)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Cross-collection move: append the dragged request into the target group.
    const withDragged =
      dragged.collection_id === targetCollection
        ? siblings
        : [...siblings, { ...dragged }];
    const targetIndex = withDragged.findIndex(
      (request) => request.id === target.id,
    );
    const changed = reorderSiblings(withDragged, dragged.id, targetIndex);
    if (changed.length === 0 && dragged.collection_id === targetCollection) {
      return;
    }
    void reorder({
      kind: "request",
      newParentId: targetCollection,
      siblings:
        changed.length > 0
          ? changed
          : [{ id: dragged.id, sort_order: withDragged.length - 1 }],
    });
  }

  return {
    draggingId,
    dropTargetId,
    onDragStart: setDraggingId,
    onDragEnd: () => {
      setDraggingId(null);
      setDropTargetId(null);
    },
    onDragOverRow: setDropTargetId,
    onDropOnRow,
  };
}
