import { create } from "zustand";
import { historyClear, historyList } from "../lib/ipc";
import type { HistoryEntry } from "../lib/types";
import {
  EMPTY_HISTORY_FILTERS,
  filterHistory,
  historyFiltersActive,
  type HistoryFilters,
  type StatusBucket,
} from "../lib/historyFilter";

export type HistoryScope = "all" | "request";

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;

  scope: HistoryScope;

  /** Client-side facets over the loaded page: status bucket, method, url text. */
  filters: HistoryFilters;
  toggleBucket: (bucket: StatusBucket) => void;
  toggleMethod: (method: string) => void;
  setText: (text: string) => void;
  clearFilters: () => void;
  filtersActive: () => boolean;
  /** entries after the active facets — what the list renders. */
  visibleEntries: () => HistoryEntry[];
  /** ids picked for diff; max 2, FIFO drop the oldest when a 3rd is added. */
  selectedIds: string[];
  /** entry previewed read-only in the dock (single-open), or null. */
  openedId: string | null;

  drawerOpen: boolean;
  diffOpen: boolean;
  /** last explicit limit; null = Rust default page. */
  limit: number | null;

  open: () => void;
  close: () => void;
  setScope: (scope: HistoryScope) => void;
  load: (activeRequestId: string | null, limit: number | null) => Promise<void>;
  refresh: (activeRequestId: string | null) => Promise<void>;
  clear: () => Promise<void>;

  openEntry: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  openDiff: () => void;
  closeDiff: () => void;

  entryById: (id: string) => HistoryEntry | null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  scope: "all",
  selectedIds: [],
  openedId: null,

  drawerOpen: false,
  diffOpen: false,
  limit: null,

  filters: EMPTY_HISTORY_FILTERS,

  toggleBucket: (bucket) =>
    set((state) => ({
      filters: {
        ...state.filters,
        buckets: state.filters.buckets.includes(bucket)
          ? state.filters.buckets.filter((b) => b !== bucket)
          : [...state.filters.buckets, bucket],
      },
    })),

  toggleMethod: (method) => {
    const upper = method.toUpperCase();
    set((state) => ({
      filters: {
        ...state.filters,
        methods: state.filters.methods.includes(upper)
          ? state.filters.methods.filter((m) => m !== upper)
          : [...state.filters.methods, upper],
      },
    }));
  },

  setText: (text) =>
    set((state) => ({ filters: { ...state.filters, text } })),

  clearFilters: () => set({ filters: EMPTY_HISTORY_FILTERS }),

  filtersActive: () => historyFiltersActive(get().filters),

  visibleEntries: () => filterHistory(get().entries, get().filters),

  open: () => set({ drawerOpen: true }),
  close: () => set({ drawerOpen: false, diffOpen: false }),

  setScope: (scope) => set({ scope }),

  load: async (activeRequestId, limit) => {
    set({ loading: true, error: null, limit });
    const requestId = get().scope === "request" ? activeRequestId : null;
    try {
      const entries = await historyList(requestId, limit);
      set({ entries, loading: false });
    } catch (error) {
      set({ entries: [], loading: false, error: String(error) });
    }
  },

  refresh: (activeRequestId) => get().load(activeRequestId, get().limit),

  clear: async () => {
    try {
      await historyClear();
      set({
        entries: [],
        selectedIds: [],
        openedId: null,
        diffOpen: false,
        error: null,
      });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  openEntry: (id) => set({ openedId: id }),

  toggleSelect: (id) => {
    const current = get().selectedIds;
    if (current.includes(id)) {
      set({ selectedIds: current.filter((x) => x !== id) });
      return;
    }
    const next = [...current, id];
    while (next.length > 2) next.shift(); // FIFO: keep the newest two
    set({ selectedIds: next });
  },

  clearSelection: () => set({ selectedIds: [] }),

  openDiff: () => {
    if (get().selectedIds.length === 2) set({ diffOpen: true });
  },

  closeDiff: () => set({ diffOpen: false }),

  entryById: (id) => get().entries.find((entry) => entry.id === id) ?? null,
}));
