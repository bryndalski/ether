import { useCallback } from "react";
import { useCollectionsStore } from "../state/useCollectionsStore";
import { useUiStore } from "../state/useUiStore";
import type { RequestOptions, StoredRequest } from "../lib/types";

const DEFAULT_OPTIONS: RequestOptions = {
  follow_redirects: true,
  max_redirects: 10,
  timeout_ms: 30_000,
  insecure: false,
  ca_bundle_path: null,
  compressed: true,
  cookie_jar: null,
};

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Creates a fresh draft request in the local store and selects it. Persistence
 *  lands once the store backend is implemented; the shell stays usable now. */
export function useNewRequest() {
  const closePalette = useUiStore((state) => state.closePalette);

  return useCallback(() => {
    const store = useCollectionsStore.getState();
    const request: StoredRequest = {
      id: makeId(),
      collection_id: store.collections[0]?.id ?? "",
      name: "Nowy request",
      method: "GET",
      url: "",
      headers: [],
      query_params: [],
      body: { type: "none" },
      auth: { type: "none" },
      options: DEFAULT_OPTIONS,
      sort_order: store.requests.length,
      docs_md: null,
      graphql: null,
    };
    useCollectionsStore.setState({
      requests: [...store.requests, request],
      activeRequestId: request.id,
    });
    closePalette();
  }, [closePalette]);
}
