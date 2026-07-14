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
  ArgumentNode,
  DocumentNode,
  FieldNode,
  GraphQLArgument,
  GraphQLField,
  GraphQLObjectType,
  GraphQLSchema,
  OperationDefinitionNode,
  SelectionSetNode,
} from "graphql";
import type { GraphQLInputType } from "graphql";
import {
  getNamedType,
  isCompositeType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isScalarType,
  Kind,
  OperationTypeNode,
  parse,
  print,
} from "graphql";

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

// ---------------------------------------------------------------------------
// Schema-aware skeleton insertion (picking a root field from the tree/picker).
//
// Picking a field via applySelectionToQuery only adds the bare field name. That
// leaves an object field with an empty selection set (invalid) and skips its
// required arguments. buildFieldSkeleton fills both: required (non-null) args as
// `$var` placeholders wired into the operation's variable definitions, plus the
// first level of scalar sub-fields so the result is immediately runnable.
// ---------------------------------------------------------------------------

/** Only NON-NULL (required) args become `$var` placeholders — optional args are
 *  left out so the skeleton stays minimal and valid. */
function requiredArgumentNodes(args: readonly GraphQLArgument[]): ArgumentNode[] {
  return args
    .filter((arg) => isNonNullType(arg.type))
    .map((arg) => ({
      kind: Kind.ARGUMENT,
      name: { kind: Kind.NAME, value: arg.name },
      value: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: arg.name } },
    }));
}

/** The first level of a composite type's scalar/enum leaves, as bare field
 *  nodes. Object/interface children are omitted (the user drills further via the
 *  tree) so we never generate an infinitely deep skeleton. */
function firstLevelLeaves(type: GraphQLObjectType): FieldNode[] {
  const leaves: FieldNode[] = [];
  for (const field of Object.values(type.getFields())) {
    const named = getNamedType(field.type);
    if (!isCompositeType(named)) {
      leaves.push(fieldNode(field.name, false));
    }
  }
  return leaves;
}

/** Build the FieldNode for a picked root field, complete with required-arg
 *  placeholders and (for object fields) a first level of scalar leaves. */
function skeletonFieldNode(field: GraphQLField<unknown, unknown>): FieldNode {
  const named = getNamedType(field.type);
  const args = requiredArgumentNodes(field.args);
  const isComposite = isCompositeType(named);
  const leaves = isComposite ? firstLevelLeaves(named as GraphQLObjectType) : [];
  return {
    kind: Kind.FIELD,
    name: { kind: Kind.NAME, value: field.name },
    arguments: args.length > 0 ? args : undefined,
    selectionSet:
      isComposite
        ? {
            kind: Kind.SELECTION_SET,
            selections: leaves.length > 0 ? leaves : [fieldNode("__typename", false)],
          }
        : undefined,
  };
}

/** A plausible starter VALUE for an input type, so the Variables panel can be
 *  pre-seeded the moment a field with required args is picked. Scalars get
 *  their zero value, enums their first member, input objects recurse over
 *  their own REQUIRED fields (depth-capped against cyclic inputs). */
function suggestedValueForType(type: GraphQLInputType, depth: number): unknown {
  if (isNonNullType(type)) return suggestedValueForType(type.ofType, depth);
  if (isListType(type))
    return depth > 3 ? [] : [suggestedValueForType(type.ofType, depth + 1)];
  const named = getNamedType(type);
  if (isEnumType(named)) return named.getValues()[0]?.name ?? "";
  if (isInputObjectType(named)) {
    if (depth > 3) return {};
    const out: Record<string, unknown> = {};
    for (const field of Object.values(named.getFields())) {
      if (isNonNullType(field.type)) {
        out[field.name] = suggestedValueForType(field.type, depth + 1);
      }
    }
    return out;
  }
  if (isScalarType(named)) {
    switch (named.name) {
      case "Int":
      case "Float":
        return 0;
      case "Boolean":
        return false;
      default:
        return ""; // String, ID, and custom scalars
    }
  }
  return null;
}

/** Starter variables for a root field's REQUIRED args — mirrors exactly the
 *  `$vars` that applyFieldSkeletonToQuery splices into the operation header,
 *  so picking a field in the tree fills the Variables panel to match. */
export function suggestedVariablesForField(
  schema: GraphQLSchema,
  opType: OperationType,
  fieldName: string,
): Record<string, unknown> {
  const rootType =
    opType === "mutation"
      ? schema.getMutationType()
      : opType === "subscription"
        ? schema.getSubscriptionType()
        : schema.getQueryType();
  const field = rootType?.getFields()[fieldName];
  if (!field) return {};
  const out: Record<string, unknown> = {};
  for (const arg of field.args) {
    if (isNonNullType(arg.type)) {
      out[arg.name] = suggestedValueForType(arg.type, 0);
    }
  }
  return out;
}

/** The `($a: T!, $b: T)` operation variable definitions for a field's required
 *  args, printed as text so we can prepend them to the operation header. */
function requiredVarDefs(field: GraphQLField<unknown, unknown>): string {
  const defs = field.args
    .filter((arg) => isNonNullType(arg.type))
    .map((arg) => `$${arg.name}: ${arg.type.toString()}`);
  return defs.length > 0 ? `(${defs.join(", ")})` : "";
}

/** Add a top-level root field WITH its skeleton (required args + first-level
 *  scalars) to the current query and return the printed text. Schema-driven, so
 *  it's a no-op-ish fallback (bare field) when the field can't be found. */
export function applyFieldSkeletonToQuery(
  query: string,
  opType: OperationType,
  schema: GraphQLSchema,
  fieldName: string,
): string {
  const rootType =
    opType === "mutation"
      ? schema.getMutationType()
      : opType === "subscription"
        ? schema.getSubscriptionType()
        : schema.getQueryType();
  const field = rootType?.getFields()[fieldName];
  if (!field) return applySelectionToQuery(query, opType, [fieldName], true);

  const doc = parseOperation(query, opType);
  const op = operationOfType(doc, opType);
  const withoutSeed = op.selectionSet.selections.filter(
    (sel) => !(sel.kind === Kind.FIELD && sel.name.value === "__typename"),
  );
  const alreadyThere = withoutSeed.some(
    (sel) => sel.kind === Kind.FIELD && sel.name.value === fieldName,
  );
  if (alreadyThere) return query;

  const nextSet: SelectionSetNode = {
    kind: Kind.SELECTION_SET,
    selections: [...withoutSeed, skeletonFieldNode(field)],
  };
  const nextOp: OperationDefinitionNode = { ...op, selectionSet: nextSet };
  const hadOp = doc.definitions.includes(op);
  const definitions = hadOp
    ? doc.definitions.map((def) => (def === op ? nextOp : def))
    : [...doc.definitions, nextOp];

  const printed = print({ ...doc, definitions });
  // graphql-js can't attach variable definitions we didn't parse, so splice the
  // `($arg: T!)` header in textually. graphql-js prints a query with no vars as
  // the anonymous shorthand `{ ... }` (no `query` keyword); to carry variable
  // definitions we must name the operation, so add the keyword when missing.
  const header = requiredVarDefs(field);
  if (header === "") return printed;
  const withKeyword = new RegExp(`^(${opType})(\\s*)\\{`);
  if (withKeyword.test(printed)) {
    return printed.replace(withKeyword, `$1 ${header} {`);
  }
  // anonymous shorthand `{ ... }` -> `query ($id: ID!) { ... }`
  return printed.replace(/^\{/, `${opType} ${header} {`);
}
