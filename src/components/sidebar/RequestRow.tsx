import { useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import type { StoredRequest } from "../../lib/types";
import { MethodBadge } from "../common/MethodBadge";
import { Icon } from "../common/Icon";
import { RowContextMenu, type MenuItem } from "./RowContextMenu";
import { InlineRename } from "./InlineRename";
import { useT } from "../../i18n/useT";
import type { SidebarDnDApi } from "../../hooks/useSidebarDnD";

interface RequestRowProps {
  request: StoredRequest;
  selected: boolean;
  depth: number;
  renaming: boolean;
  onSelect: (id: string) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  dnd: SidebarDnDApi;
}

/** A single request in the collection tree — the load-request trigger (§5): its
 *  onSelect calls selectRequest, which re-seeds the workbench draft. Carries a
 *  kebab context menu (rename / duplicate / move / delete) and DnD reorder. */
export function RequestRow({
  request,
  selected,
  depth,
  renaming,
  onSelect,
  onStartRename,
  onCancelRename,
  dnd,
}: RequestRowProps) {
  const renameRequest = useCollectionsStore((state) => state.renameRequest);
  const duplicateRequest = useCollectionsStore(
    (state) => state.duplicateRequest,
  );
  const removeRequest = useCollectionsStore((state) => state.removeRequest);
  const requests = useCollectionsStore((state) => state.requests);
  const reorder = useCollectionsStore((state) => state.reorder);
  const t = useT();

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function moveBy(delta: number) {
    const siblings = requests
      .filter((r) => r.collection_id === request.collection_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = siblings.findIndex((r) => r.id === request.id);
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    void reorder({
      kind: "request",
      newParentId: request.collection_id,
      siblings: reordered.map((r, i) => ({ id: r.id, sort_order: i })),
    });
  }

  const items: MenuItem[] = [
    { label: t("common.rename"), icon: "i-copy", onSelect: () => onStartRename(request.id) },
    { label: t("sidebar.duplicate"), icon: "i-copy", onSelect: () => void duplicateRequest(request.id) },
    { label: t("common.moveUp"), icon: "i-arrow-up", onSelect: () => moveBy(-1) },
    { label: t("common.moveDown"), icon: "i-arrow-down", onSelect: () => moveBy(1) },
    { label: t("common.delete"), icon: "i-trash", danger: true, onSelect: () => void removeRequest(request.id) },
  ];

  const isDropTarget = dnd.dropTargetId === request.id && dnd.draggingId !== null;

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-current={selected ? "true" : undefined}
        aria-grabbed={dnd.draggingId === request.id}
        className={`tree-row${selected ? " active" : ""}${
          isDropTarget ? " drop-before" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!renaming}
        onClick={() => !renaming && onSelect(request.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(request.id);
          }
        }}
        tabIndex={0}
        onDragStart={() => dnd.onDragStart(request.id)}
        onDragEnd={dnd.onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          dnd.onDragOverRow(request.id);
        }}
        onDrop={() => dnd.onDropOnRow(request)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <MethodBadge method={request.method} />
        {renaming ? (
          <InlineRename
            value={request.name}
            onCommit={(name) => {
              void renameRequest(request.id, name);
              onCancelRename();
            }}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="truncate flex-1">
            {request.name}
            {request.graphql != null && (
              <span className="gql-badge" style={{ marginLeft: 6 }}>
                GraphQL
              </span>
            )}
          </span>
        )}
        {!renaming && (
          <button
            type="button"
            className="tree-kebab"
            aria-label={t("sidebar.rowActions", { name: request.name })}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.left, y: rect.bottom });
            }}
          >
            <Icon name="i-more" size={15} />
          </button>
        )}
      </div>
      {menu && (
        <RowContextMenu items={items} anchor={menu} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
