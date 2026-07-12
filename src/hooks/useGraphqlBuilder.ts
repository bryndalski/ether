// Wires the two-way builder<->editor sync over the pure AST helpers. The query
// text (draft.graphql.query) is the single source of truth; `selection` is a
// derived projection of it. Tree toggles produce a new query (guarded by
// sameOperation so idempotent/whitespace edits don't churn); editor edits just
// change the query and the tree re-derives.

import { useCallback, useMemo, useRef } from "react";
import type { GraphQLSchema } from "graphql";
import type { DraftAction, RequestDraft } from "./useRequestDraft";
import {
  applySelectionToQuery,
  deriveSelection,
  pathKey,
  sameOperation,
  type FieldPath,
  type OperationType,
} from "../lib/graphqlSelection";

export interface GraphqlBuilderApi {
  opType: OperationType;
  query: string;
  variablesJson: string;
  selection: Set<string>;
  isSelected: (path: FieldPath) => boolean;
  toggleField: (path: FieldPath, on: boolean) => void;
  setOpType: (opType: OperationType) => void;
  setQuery: (query: string) => void;
  setVariables: (variablesJson: string) => void;
}

export function useGraphqlBuilder(
  draft: RequestDraft,
  _schema: GraphQLSchema | null,
  dispatch: React.Dispatch<DraftAction>,
): GraphqlBuilderApi {
  const opType = (draft.graphql?.operation_type ?? "query") as OperationType;
  const query = draft.graphql?.query ?? "";
  const variablesJson = draft.graphql?.variables_json ?? "{}";

  // Preserve the previous selection across parse errors (mid-typing) so the tree
  // doesn't flash empty on every invalid keystroke.
  const prevSelection = useRef<Set<string>>(new Set());
  const selection = useMemo(() => {
    const next = deriveSelection(query, opType, prevSelection.current);
    prevSelection.current = next;
    return next;
  }, [query, opType]);

  const isSelected = useCallback(
    (path: FieldPath) => selection.has(pathKey(path)),
    [selection],
  );

  const setQuery = useCallback(
    (nextQuery: string) => {
      // Loop guard: skip the dispatch when the operation is structurally the
      // same (whitespace/format-only), so typing doesn't fight the tree.
      if (sameOperation(nextQuery, query)) return;
      dispatch({ kind: "setGraphql", graphql: { query: nextQuery } });
    },
    [dispatch, query],
  );

  const toggleField = useCallback(
    (path: FieldPath, on: boolean) => {
      const nextQuery = applySelectionToQuery(query, opType, path, on);
      if (sameOperation(nextQuery, query)) return;
      dispatch({ kind: "setGraphql", graphql: { query: nextQuery } });
    },
    [dispatch, query, opType],
  );

  const setOpType = useCallback(
    (nextOpType: OperationType) => {
      dispatch({ kind: "setGraphql", graphql: { operation_type: nextOpType } });
    },
    [dispatch],
  );

  const setVariables = useCallback(
    (nextVariables: string) => {
      dispatch({ kind: "setGraphql", graphql: { variables_json: nextVariables } });
    },
    [dispatch],
  );

  return {
    opType,
    query,
    variablesJson,
    selection,
    isSelected,
    toggleField,
    setOpType,
    setQuery,
    setVariables,
  };
}
