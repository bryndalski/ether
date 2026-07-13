import type { SidebarTreeApi } from "../../hooks/useSidebarTree";
import type { SidebarFilters } from "../../lib/collectionTree";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface SidebarFilterBarProps {
  view: SidebarTreeApi;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const TYPES: SidebarFilters["type"][] = ["all", "rest", "graphql"];

const TYPE_LABEL: Record<SidebarFilters["type"], "typeAll" | "typeRest" | "typeGraphql"> = {
  all: "typeAll",
  rest: "typeRest",
  graphql: "typeGraphql",
};

/** Facet row under the sidebar search: multi-select HTTP method chips and a
 *  REST/GraphQL type toggle. Facets combine with the text search; a result
 *  count and a one-click clear appear whenever anything is filtering. */
export function SidebarFilterBar({ view }: SidebarFilterBarProps) {
  const t = useT();
  const { filters } = view;
  const anyFilter = view.filtersActive || view.query.trim() !== "";

  return (
    <div className="sidebar-filters" role="group" aria-label={t("sidebar.filtersAria")}>
      <div className="sidebar-filter-methods">
        {METHODS.map((method) => {
          const on = filters.methods.includes(method);
          return (
            <button
              key={method}
              type="button"
              className={`sidebar-chip method-${method.toLowerCase()}${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => view.toggleMethod(method)}
            >
              {method}
            </button>
          );
        })}
      </div>

      <div className="sidebar-filter-row">
        <div className="sidebar-type-toggle" role="group" aria-label={t("sidebar.typeFilterAria")}>
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={filters.type === type}
              className={filters.type === type ? "on" : ""}
              onClick={() => view.setType(type)}
            >
              {t(`sidebar.${TYPE_LABEL[type]}`)}
            </button>
          ))}
        </div>

        {anyFilter && (
          <div className="sidebar-filter-meta">
            <span className="sidebar-result-count">
              {t("sidebar.resultCount", { count: view.resultCount })}
            </span>
            <button
              type="button"
              className="sidebar-clear-filters"
              aria-label={t("sidebar.clearFilters")}
              title={t("sidebar.clearFilters")}
              onClick={view.clearFilters}
            >
              <Icon name="i-x" size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
