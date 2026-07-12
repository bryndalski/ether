// The two-way builder<->editor sync, all through the graphql-js AST (never
// string-hacking). The query TEXT is the single source of truth; the field-tree
// selection is a derived projection computed by parsing that text.
//
// Direction A — tree checkbox -> query  : applySelectionToQuery
// Direction B — query text    -> checkboxes : deriveSelection
// Loop guard  — canonical structural equality : sameOperation
//
// A FieldPath is the list of field names from the operation root, e.g.
// ["user"], ["user", "id"]. Its join-key (dot-joined) is what the tree keys on.

import type {
  DocumentNode,
  FieldNode,
  OperationDefinitionNode,
  SelectionSetNode,
} from "graphql";
import { Kind, OperationTypeNode, parse, print } from "graphql";

export type OperationType = "query" | "mutation" | "subscription";
export type FieldPath = string[];

const OPERATION_NODE: Record<OperationType, OperationTypeNode> = {
  query: OperationTypeNode.QUERY,
  mutation: OperationTypeNode.MUTATION,
  subscription: OperationTypeNode.SUBSCRIPTION,
};

/** A fresh operation shell of the given type. Seeded with `__typename` because
 *  GraphQL forbids an empty selection set — the seed keeps the text parseable
 *  until the user checks a real field (which replaces it, see mutateSelection). */
export function defaultOperation(opType: OperationType): string {
  return `${opType} {\n  __typename\n}`;
}

/** Build an empty-selection operation document directly as an AST (bypasses the
 *  "empty selection set is a syntax error" rule that blocks parsing text). */
function emptyDocument(opType: OperationType): DocumentNode {
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: OPERATION_NODE[opType],
        selectionSet: emptySelectionSet(),
      },
    ],
  };
}

export function pathKey(path: FieldPath): string {
  return path.join(".");
}

function emptySelectionSet(): SelectionSetNode {
  return { kind: Kind.SELECTION_SET, selections: [] };
}

function fieldNode(name: string, withSelectionSet: boolean): FieldNode {
  return {
    kind: Kind.FIELD,
    name: { kind: Kind.NAME, value: name },
    selectionSet: withSelectionSet ? emptySelectionSet() : undefined,
  };
}

/** Parse, tolerating an empty/blank query by starting from a fresh AST shell
 *  (an empty selection set can't be expressed in text, so we build it directly). */
function parseOperation(query: string, opType: OperationType): DocumentNode {
  if (!query || query.trim() === "") return emptyDocument(opType);
  try {
    return parse(query);
  } catch {
    return emptyDocument(opType);
  }
}

/** Find (or synthesize) the operation definition matching opType. */
function operationOfType(
  doc: DocumentNode,
  opType: OperationType,
): OperationDefinitionNode {
  const node = OPERATION_NODE[opType];
  const found = doc.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION && def.operation === node,
  );
  if (found) return found;
  return {
    kind: Kind.OPERATION_DEFINITION,
    operation: node,
    selectionSet: emptySelectionSet(),
  };
}

function fieldByName(set: SelectionSetNode, name: string): FieldNode | null {
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD && sel.name.value === name) return sel;
  }
  return null;
}

/** Add or remove a field at `path`, pruning now-empty parents on removal. */
function mutateSelection(
  root: SelectionSetNode,
  path: FieldPath,
  on: boolean,
): SelectionSetNode {
  if (path.length === 0) return root;
  const [head, ...rest] = path;
  const existing = fieldByName(root, head);

  if (rest.length === 0) {
    if (on) {
      if (existing) return root;
      // Drop a lone `__typename` seed as the first real field arrives.
      const base = root.selections.filter(
        (sel) => !(sel.kind === Kind.FIELD && sel.name.value === "__typename"),
      );
      return { ...root, selections: [...base, fieldNode(head, false)] };
    }
    // remove
    return {
      ...root,
      selections: root.selections.filter(
        (sel) => !(sel.kind === Kind.FIELD && sel.name.value === head),
      ),
    };
  }

  // recurse into a child selection set (create it when turning on)
  const child = existing ?? (on ? fieldNode(head, true) : null);
  if (!child) return root;
  const childSet = child.selectionSet ?? emptySelectionSet();
  const nextChildSet = mutateSelection(childSet, rest, on);

  // when removal empties the child, prune the child field entirely
  if (!on && nextChildSet.selections.length === 0) {
    return {
      ...root,
      selections: root.selections.filter(
        (sel) => !(sel.kind === Kind.FIELD && sel.name.value === head),
      ),
    };
  }

  const nextChild: FieldNode = { ...child, selectionSet: nextChildSet };
  const others = root.selections.filter(
    (sel) => !(sel.kind === Kind.FIELD && sel.name.value === head),
  );
  return { ...root, selections: [...others, nextChild] };
}

/** Direction A: toggle a field into/out of the operation, return printed query. */
export function applySelectionToQuery(
  query: string,
  opType: OperationType,
  path: FieldPath,
  on: boolean,
): string {
  const doc = parseOperation(query, opType);
  const op = operationOfType(doc, opType);
  const nextSet = mutateSelection(op.selectionSet, path, on);
  // An empty top-level selection set can't be printed; reseed __typename so the
  // shell stays valid (the seed disappears the moment a real field is added).
  const printableSet: SelectionSetNode =
    nextSet.selections.length === 0
      ? { ...nextSet, selections: [fieldNode("__typename", false)] }
      : nextSet;
  const nextOp: OperationDefinitionNode = { ...op, selectionSet: printableSet };

  const hadOp = doc.definitions.includes(op);
  const definitions = hadOp
    ? doc.definitions.map((def) => (def === op ? nextOp : def))
    : [...doc.definitions, nextOp];

  return print({ ...doc, definitions });
}

function walkSelectionSet(
  set: SelectionSetNode,
  prefix: FieldPath,
  out: Set<string>,
): void {
  for (const sel of set.selections) {
    if (sel.kind !== Kind.FIELD) continue;
    if (sel.name.value === "__typename") continue; // shell seed, not a real pick
    const path = [...prefix, sel.name.value];
    out.add(pathKey(path));
    if (sel.selectionSet) walkSelectionSet(sel.selectionSet, path, out);
  }
}

/** Direction B: the set of selected FieldPath keys for the current opType.
 *  On a parse error (mid-typing) return `previous` so the tree doesn't thrash. */
export function deriveSelection(
  query: string,
  opType: OperationType,
  previous: Set<string> = new Set(),
): Set<string> {
  if (!query || query.trim() === "") return new Set();
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return previous;
  }
  const op = doc.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION &&
      def.operation === OPERATION_NODE[opType],
  );
  if (!op) return new Set();
  const out = new Set<string>();
  walkSelectionSet(op.selectionSet, [], out);
  return out;
}

/** Loop guard: true iff both texts print to the same canonical AST, so
 *  whitespace-only edits don't fight the tree and tree toggles stay idempotent.
 *  Unparseable inputs fall back to raw string comparison. */
export function sameOperation(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return print(parse(a)) === print(parse(b));
  } catch {
    return a === b;
  }
}
