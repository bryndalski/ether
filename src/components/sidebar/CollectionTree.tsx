import { useCollectionsStore } from "../../state/useCollectionsStore";
import { TreeGroup } from "./TreeGroup";
import { RequestRow } from "./RequestRow";
import type { SidebarTreeApi } from "../../hooks/useSidebarTree";
import { useSidebarDnD } from "../../hooks/useSidebarDnD";

interface CollectionTreeProps {
  view: SidebarTreeApi;
  activeRequestId: string | null;
}

/** Renders the built (and optionally filtered) tree: folder groups recursively
 *  via TreeGroup, then any orphan requests ungrouped. */
export function CollectionTree({ view, activeRequestId }: CollectionTreeProps) {
  const selectRequest = useCollectionsStore((state) => state.selectRequest);
  const dnd = useSidebarDnD();
  const { roots, orphanRequests } = view.tree;

  return (
    <div role="tree" aria-label="Kolekcje" className="flex flex-col py-1">
      {roots.map((node) => (
        <TreeGroup
          key={node.collection.id}
          node={node}
          depth={0}
          activeRequestId={activeRequestId}
          view={view}
          dnd={dnd}
        />
      ))}
      {orphanRequests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          selected={request.id === activeRequestId}
          depth={0}
          renaming={view.renamingId === request.id}
          onSelect={selectRequest}
          onStartRename={view.startRename}
          onCancelRename={view.cancelRename}
          dnd={dnd}
        />
      ))}
    </div>
  );
}
