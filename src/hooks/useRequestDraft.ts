// The live, per-edit request state. Shape === StoredRequest so mapping to the
// IPC payload is the identity function. All the tricky logic (Params↔URL sync,
// body-mode transitions, from_curl merge) lives here, never in view components.

import { useEffect, useReducer } from "react";
import type {
  Auth,
  Body,
  KeyValue,
  RequestSpec,
  StoredRequest,
} from "../lib/types";
import { buildUrl, parseQuery } from "../lib/urlParams";

export type RequestDraft = StoredRequest;

export type DraftAction =
  | { kind: "seed"; request: StoredRequest }
  | { kind: "setMethod"; method: string }
  | { kind: "setUrl"; url: string }
  | { kind: "setParams"; params: KeyValue[] }
  | { kind: "setHeaders"; headers: KeyValue[] }
  | { kind: "setBody"; body: Body }
  | { kind: "setAuth"; auth: Auth }
  | { kind: "importSpec"; spec: RequestSpec };

export interface DraftCounts {
  params: number;
  headers: number;
  body: number;
  auth: number;
}

export interface DraftApi {
  draft: RequestDraft;
  dispatch: React.Dispatch<DraftAction>;
  counts: DraftCounts;
}

function enabledCount(rows: KeyValue[]): number {
  return rows.filter((row) => row.enabled && row.name !== "").length;
}

function bodyCount(body: Body): number {
  return body.type === "none" ? 0 : 1;
}

function authCount(auth: Auth): number {
  return auth.type === "none" ? 0 : 1;
}

// Params↔URL guard: each branch computes the *other* side from the *changed*
// side only, so it never re-fires the opposite action (no feedback loop).
export function draftReducer(
  draft: RequestDraft,
  action: DraftAction,
): RequestDraft {
  switch (action.kind) {
    case "seed":
      return action.request;
    case "setMethod":
      return { ...draft, method: action.method };
    case "setUrl":
      return {
        ...draft,
        url: action.url,
        query_params: parseQuery(action.url, draft.query_params),
      };
    case "setParams":
      return {
        ...draft,
        query_params: action.params,
        url: buildUrl(draft.url, action.params),
      };
    case "setHeaders":
      return { ...draft, headers: action.headers };
    case "setBody":
      return { ...draft, body: action.body };
    case "setAuth":
      return { ...draft, auth: action.auth };
    case "importSpec": {
      const { spec } = action;
      return {
        ...draft,
        method: spec.method,
        url: spec.url,
        headers: spec.headers,
        body: spec.body,
        auth: spec.auth,
        options: spec.options,
        query_params: parseQuery(spec.url, draft.query_params),
      };
    }
  }
}

/** Reducer-backed draft, re-seeded whenever a different request is selected. */
export function useRequestDraft(seed: StoredRequest | null): DraftApi {
  const [draft, dispatch] = useReducer(
    draftReducer,
    seed ?? (EMPTY_DRAFT as RequestDraft),
  );

  useEffect(() => {
    if (seed) dispatch({ kind: "seed", request: seed });
  }, [seed?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    draft,
    dispatch,
    counts: {
      params: enabledCount(draft.query_params),
      headers: enabledCount(draft.headers),
      body: bodyCount(draft.body),
      auth: authCount(draft.auth),
    },
  };
}

// A neutral placeholder for the reducer's initial state when nothing is
// selected; RequestWorkbench renders the EmptyState instead of using this.
const EMPTY_DRAFT: StoredRequest = {
  id: "",
  collection_id: "",
  name: "",
  method: "GET",
  url: "",
  headers: [],
  query_params: [],
  body: { type: "none" },
  auth: { type: "none" },
  options: {
    follow_redirects: true,
    max_redirects: 10,
    timeout_ms: 30_000,
    insecure: false,
    ca_bundle_path: null,
    compressed: true,
    cookie_jar: null,
  },
  sort_order: 0,
  docs_md: null,
  graphql: null,
};
