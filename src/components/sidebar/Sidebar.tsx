import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useUiStore } from "../../state/useUiStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { useSidebarTree } from "../../hooks/useSidebarTree";
import { useT } from "../../i18n/useT";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarFilterBar } from "./SidebarFilterBar";
import { CollectionTree } from "./CollectionTree";
import { SidebarRail } from "./SidebarRail";
import "./sidebar.css";

/** Collections rail (Zone 1). Search header + functional tree; shows a heat
 *  empty-state with a "New request" action when there is nothing to show
 *  (including the "backend unavailable" case). */
export function Sidebar() {
  const requests = useCollectionsStore((state) => state.requests);
  const collections = useCollectionsStore((state) => state.collections);
  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  const loading = useCollectionsStore((state) => state.loading);
  const loadFailed = useCollectionsStore((state) => state.loadFailed);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const newRequest = useNewRequest();
  const view = useSidebarTree();
  const t = useT();

  const isEmpty =
    !loading && requests.length === 0 && collections.length === 0;

  if (collapsed) return <SidebarRail />;

  return (
    <aside
      className="flex shrink-0 flex-col"
      style={{
        width: sidebarWidth,
        minWidth: "var(--lok-sidebar-w-min)",
        maxWidth: "var(--lok-sidebar-w-max)",
        backgroundColor: "var(--lok-bg-sidebar)",
        borderRight: "1px solid var(--lok-border-subtle)",
      }}
    >
      <SidebarHeader query={view.query} onQueryChange={view.setQuery} />
      {!isEmpty && <SidebarFilterBar view={view} />}

      <div className="lok-scroll flex-1" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <EmptyState
            compact
            headline={t("sidebar.emptyHeadline")}
            hint={
              loadFailed
                ? t("sidebar.emptyBackendOffline")
                : t("sidebar.emptyHint")
            }
            actionLabel={t("palette.newRequest")}
            shortcut="⌘N"
            onAction={newRequest}
            icon={<Icon name="i-folder" size={18} />}
          />
        ) : (
          <CollectionTree view={view} activeRequestId={activeRequestId} />
        )}
      </div>
    </aside>
  );
}
