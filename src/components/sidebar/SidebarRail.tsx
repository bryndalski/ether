import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useUiStore } from "../../state/useUiStore";
import { useNewRequest } from "../../hooks/useNewRequest";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

/** The collapsed collections rail: a narrow icon-only strip. An expand toggle at
 *  the top, a "new request" affordance, then each request as a method-badge chip
 *  whose tooltip carries the full name (icons + tooltips, never color-only). ⌘B
 *  or the toggle expands it back to the full tree. */
export function SidebarRail() {
  const requests = useCollectionsStore((state) => state.requests);
  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  const selectRequest = useCollectionsStore((state) => state.selectRequest);
  const expand = useUiStore((state) => state.toggleSidebarCollapsed);
  const newRequest = useNewRequest();
  const t = useT();

  return (
    <aside
      className="sidebar-rail flex shrink-0 flex-col items-center"
      aria-label={t("sidebar.collectionsTree")}
    >
      <button
        type="button"
        className="sidebar-rail-btn"
        aria-label={t("common.expandSidebar")}
        title={`${t("common.expandSidebar")} · ⌘B`}
        aria-expanded={false}
        onClick={expand}
      >
        <Icon name="i-panel-left" size={17} />
      </button>
      <button
        type="button"
        className="sidebar-rail-btn"
        aria-label={t("palette.newRequest")}
        title={`${t("palette.newRequest")} · ⌘N`}
        onClick={newRequest}
      >
        <Icon name="i-plus" size={17} />
      </button>

      <div className="sidebar-rail-list lok-scroll">
        {requests.map((request) => {
          const method = request.method.toUpperCase();
          const selected = request.id === activeRequestId;
          return (
            <button
              key={request.id}
              type="button"
              className={`sidebar-rail-item method ${method.toLowerCase()}${
                selected ? " selected" : ""
              }`}
              aria-label={request.name}
              aria-current={selected}
              title={`${method} · ${request.name}`}
              onClick={() => selectRequest(request.id)}
            >
              {method.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
