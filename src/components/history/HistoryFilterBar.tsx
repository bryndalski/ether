import { useHistoryStore } from "../../state/useHistoryStore";
import type { StatusBucket } from "../../lib/historyFilter";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

const BUCKETS: StatusBucket[] = ["2xx", "3xx", "4xx", "5xx", "error"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const BUCKET_LABEL: Record<StatusBucket, string> = {
  "2xx": "2xx",
  "3xx": "3xx",
  "4xx": "4xx",
  "5xx": "5xx",
  error: "ERR",
};

/** Filter row for the history drawer: status-bucket chips, method chips, and a
 *  URL text search. All client-side over the currently-loaded page; a clear
 *  button resets every facet. */
export function HistoryFilterBar() {
  const t = useT();
  const filters = useHistoryStore((state) => state.filters);
  const toggleBucket = useHistoryStore((state) => state.toggleBucket);
  const toggleMethod = useHistoryStore((state) => state.toggleMethod);
  const setText = useHistoryStore((state) => state.setText);
  const clearFilters = useHistoryStore((state) => state.clearFilters);
  const filtersActive = useHistoryStore((state) => state.filtersActive);

  return (
    <div className="hist-filters" role="group" aria-label={t("history.filtersAria")}>
      <div className="hist-filter-search">
        <span aria-hidden className="hist-filter-search-icon">
          <Icon name="i-search" size={13} />
        </span>
        <input
          type="search"
          value={filters.text}
          placeholder={t("history.filterUrl")}
          aria-label={t("history.filterUrlAria")}
          onChange={(event) => setText(event.target.value)}
        />
        {filtersActive() && (
          <button
            type="button"
            className="hist-filter-clear"
            aria-label={t("history.clearFilters")}
            title={t("history.clearFilters")}
            onClick={clearFilters}
          >
            <Icon name="i-x" size={12} />
          </button>
        )}
      </div>

      <div className="hist-filter-chips">
        {BUCKETS.map((bucket) => (
          <button
            key={bucket}
            type="button"
            className={`hist-chip bucket-${bucket}${filters.buckets.includes(bucket) ? " on" : ""}`}
            aria-pressed={filters.buckets.includes(bucket)}
            onClick={() => toggleBucket(bucket)}
          >
            {BUCKET_LABEL[bucket]}
          </button>
        ))}
        <span className="hist-filter-divider" aria-hidden />
        {METHODS.map((method) => (
          <button
            key={method}
            type="button"
            className={`hist-chip method${filters.methods.includes(method) ? " on" : ""}`}
            aria-pressed={filters.methods.includes(method)}
            onClick={() => toggleMethod(method)}
          >
            {method}
          </button>
        ))}
      </div>
    </div>
  );
}
