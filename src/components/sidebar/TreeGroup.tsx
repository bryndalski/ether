import { useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import type { TreeNode } from "../../lib/collectionTree";
import { Icon } from "../common/Icon";
import { RowContextMenu, type MenuItem } from "./RowContextMenu";
import { InlineRename } from "./InlineRename";
import { RequestRow } from "./RequestRow";
import { useT } from "../../i18n/useT";
import type { SidebarTreeApi } from "../../hooks/useSidebarTree";
import type { SidebarDnDApi } from "../../hooks/useSidebarDnD";

interface TreeGroupProps {
  node: TreeNode;
  depth: number;
  activeRequestId: string | null;
  view: SidebarTreeApi;
  dnd: SidebarDnDApi;
}

/** Folder row: chevron + folder icon + label, expand/collapse, a context menu
 *  (rename / new request / new sub-collection / delete), then its children. */
export function TreeGroup({
  node,
  depth,
  activeRequestId,
  view,
  dnd,
}: TreeGroupProps) {
  const createRequest = useCollectionsStore((state) => state.createRequest);
  const createCollection = useCollectionsStore(
    (state) => state.createCollection,
  );
  const renameCollection = useCollectionsStore(
    (state) => state.renameCollection,
  );
  const removeCollection = useCollectionsStore(
    (state) => state.removeCollection,
  );
  const t = useT();

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const expanded = view.isExpanded(node.collection.id);
  const renaming = view.renamingId === node.collection.id;

  const items: MenuItem[] = [
    {
      label: t("common.rename"),
      icon: "i-copy",
      onSelect: () => view.startRename(node.collection.id),
    },
    {
      label: t("palette.newRequest"),
      icon: "i-plus",
      onSelect: () => void createRequest(node.collection.id),
    },
    {
      label: t("sidebar.newSubcollection"),
      icon: "i-folder",
      onSelect: () => void createCollection(node.collection.id),
    },
    {
      label: t("common.delete"),
      icon: "i-trash",
      danger: true,
      onSelect: () => void removeCollection(node.collection.id),
    },
  ];

  return (
    <div role="group">
      <div
        role="treeitem"
        aria-expanded={expanded}
        className="tree-row"
        style={{ paddingLeft: 8 + depth * 14 }}
        tabIndex={0}
        onClick={() => !renaming && view.toggle(node.collection.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            view.toggle(node.collection.id);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <Icon name="i-chevr" className={`tree-chev${expanded ? " open" : ""}`} />
        <span className="tree-folder">
          <Icon name="i-folder" size={15} />
        </span>
        {renaming ? (
          <InlineRename
            value={node.collection.name}
            onCommit={(name) => {
              void renameCollection(node.collection.id, name);
              view.cancelRename();
            }}
            onCancel={view.cancelRename}
          />
        ) : (
          <span className="truncate flex-1">{node.collection.name}</span>
        )}
        {!renaming && (
          <button
            type="button"
            className="tree-kebab"
            aria-label={t("sidebar.rowActions", { name: node.collection.name })}
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

      {expanded && (
        <>
          {node.children.map((child) => (
            <TreeGroup
              key={child.collection.id}
              node={child}
              depth={depth + 1}
              activeRequestId={activeRequestId}
              view={view}
              dnd={dnd}
            />
          ))}
          {node.requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              selected={request.id === activeRequestId}
              depth={depth + 1}
              renaming={view.renamingId === request.id}
              onSelect={useCollectionsStore.getState().selectRequest}
              onStartRename={view.startRename}
              onCancelRename={view.cancelRename}
              dnd={dnd}
            />
          ))}
          {node.children.length === 0 && node.requests.length === 0 && (
            <button
              type="button"
              className="tree-empty-row"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
              onClick={() => void createRequest(node.collection.id)}
            >
              {t("sidebar.emptyAddRequest")}
            </button>
          )}
        </>
      )}

      {menu && (
        <RowContextMenu items={items} anchor={menu} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
