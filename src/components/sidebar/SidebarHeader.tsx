import { useState } from "react";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useUiStore } from "../../state/useUiStore";
import { useT } from "../../i18n/useT";
import { Icon } from "../common/Icon";
import { RowContextMenu, type MenuItem } from "./RowContextMenu";

interface SidebarHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
}

/** Search input + a "＋" menu for creating a new collection or a new request at
 *  the root. */
export function SidebarHeader({ query, onQueryChange }: SidebarHeaderProps) {
  const createCollection = useCollectionsStore(
    (state) => state.createCollection,
  );
  const createRequest = useCollectionsStore((state) => state.createRequest);
  const collections = useCollectionsStore((state) => state.collections);
  const collapse = useUiStore((state) => state.toggleSidebarCollapsed);
  const t = useT();

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const items: MenuItem[] = [
    {
      label: t("sidebar.newCollection"),
      icon: "i-folder",
      onSelect: () => void createCollection(null),
    },
    {
      label: t("palette.newRequest"),
      icon: "i-plus",
      onSelect: () => void createRequest(collections[0]?.id ?? ""),
    },
  ];

  return (
    <div
      className="flex shrink-0 items-center gap-1 p-2"
      style={{ borderBottom: "1px solid var(--lok-border-subtle)" }}
    >
      <div className="sidebar-search relative flex-1">
        <span aria-hidden className="sidebar-search-icon">
          <Icon name="i-search" size={14} />
        </span>
        <input
          type="search"
          className="sidebar-search-input"
          placeholder={t("sidebar.searchRequests")}
          aria-label={t("sidebar.searchAria")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <button
        type="button"
        aria-label={t("sidebar.addAria")}
        aria-haspopup="menu"
        className="flex shrink-0 items-center justify-center rounded-[var(--lok-radius-sm)] p-1.5 transition-colors hover:bg-[var(--lok-bg-hover)]"
        style={{ color: "var(--lok-text-secondary)" }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.right - 190, y: rect.bottom + 4 });
        }}
      >
        <Icon name="i-plus" size={16} />
      </button>
      {menu && (
        <RowContextMenu items={items} anchor={menu} onClose={() => setMenu(null)} />
      )}
      <button
        type="button"
        aria-label={t("common.collapseSidebar")}
        title={`${t("common.collapseSidebar")} · ⌘B`}
        aria-expanded={true}
        className="flex shrink-0 items-center justify-center rounded-[var(--lok-radius-sm)] p-1.5 transition-colors hover:bg-[var(--lok-bg-hover)]"
        style={{ color: "var(--lok-text-secondary)" }}
        onClick={collapse}
      >
        <Icon name="i-panel-left" size={16} />
      </button>
    </div>
  );
}
