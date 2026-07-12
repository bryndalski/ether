// Pure read-side helpers over a GraphQLSchema for the field tree and docs
// explorer: root type per operation, a field's leaf/object nature, and printing
// the `(args): Type` label the mock shows. No React, no I/O.

import type {
  GraphQLField,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
} from "graphql";
import {
  getNamedType,
  isObjectType,
  isInterfaceType,
  isEnumType,
  isInputObjectType,
  isScalarType,
} from "graphql";
import type { OperationType } from "./graphqlSelection";

/** The root object type for an operation (or null when the schema lacks one). */
export function rootTypeFor(
  schema: GraphQLSchema,
  opType: OperationType,
): GraphQLObjectType | null {
  if (opType === "mutation") return schema.getMutationType() ?? null;
  if (opType === "subscription") return schema.getSubscriptionType() ?? null;
  return schema.getQueryType() ?? null;
}

/** Which operation types the schema actually supports (query is mandatory). */
export function availableOperations(schema: GraphQLSchema): OperationType[] {
  const ops: OperationType[] = [];
  if (schema.getQueryType()) ops.push("query");
  if (schema.getMutationType()) ops.push("mutation");
  if (schema.getSubscriptionType()) ops.push("subscription");
  return ops.length > 0 ? ops : ["query"];
}

/** A field is expandable when its named type has its own fields (object/iface). */
export function isExpandable(field: GraphQLField<unknown, unknown>): boolean {
  const named = getNamedType(field.type);
  return isObjectType(named) || isInterfaceType(named);
}

export function hasArgs(field: GraphQLField<unknown, unknown>): boolean {
  return field.args.length > 0;
}

/** The `(arg1, arg2): Type` label, matching the mock's .ftype text. */
export function fieldTypeLabel(field: GraphQLField<unknown, unknown>): string {
  const argNames = field.args.map((arg) => arg.name);
  const argPart = argNames.length > 0 ? `(${argNames.join(", ")}): ` : "";
  return `${argPart}${field.type.toString()}`;
}

/** Ordered fields of an expandable field's named type (for lazy child render). */
export function childFields(
  field: GraphQLField<unknown, unknown>,
): GraphQLField<unknown, unknown>[] {
  const named = getNamedType(field.type);
  if (isObjectType(named) || isInterfaceType(named)) {
    return Object.values(named.getFields());
  }
  return [];
}

export function objectFields(
  type: GraphQLObjectType,
): GraphQLField<unknown, unknown>[] {
  return Object.values(type.getFields());
}

export type DocKind = "object" | "interface" | "enum" | "input" | "scalar" | "other";

export function docKind(type: GraphQLNamedType): DocKind {
  if (isObjectType(type)) return "object";
  if (isInterfaceType(type)) return "interface";
  if (isEnumType(type)) return "enum";
  if (isInputObjectType(type)) return "input";
  if (isScalarType(type)) return "scalar";
  return "other";
}
