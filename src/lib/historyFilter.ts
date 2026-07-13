// Pure client-side filtering for the history drawer: status bucket, HTTP method,
// and a URL substring. No React, no Tauri — unit-tested in isolation.

import type { HistoryEntry } from "./types";

/** Status buckets shown as filter chips. "error" covers status 0 (never-sent /
 *  connection error) and any non-standard sub-100 code. */
export type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "error";

export interface HistoryFilters {
  buckets: StatusBucket[];
  methods: string[];
  text: string;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  buckets: [],
  methods: [],
  text: "",
};

export function historyFiltersActive(filters: HistoryFilters): boolean {
  return (
    filters.buckets.length > 0 ||
    filters.methods.length > 0 ||
    filters.text.trim() !== ""
  );
}

export function statusBucket(status: number): StatusBucket {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "error";
}

/** Apply all active facets (AND across facet types, OR within a facet). */
export function filterHistory(
  entries: HistoryEntry[],
  filters: HistoryFilters,
): HistoryEntry[] {
  if (!historyFiltersActive(filters)) return entries;
  const needle = filters.text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (
      filters.buckets.length > 0 &&
      !filters.buckets.includes(statusBucket(entry.response.status))
    ) {
      return false;
    }
    if (
      filters.methods.length > 0 &&
      !filters.methods.includes(entry.request.method.toUpperCase())
    ) {
      return false;
    }
    if (needle !== "" && !entry.request.url.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });
}
