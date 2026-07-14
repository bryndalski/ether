import { useState } from "react";
import type { GraphQLField, GraphQLObjectType } from "graphql";
import { FieldTreeNode } from "./FieldTreeNode";
import { OperationSections } from "./OperationSections";
import { useFieldTreeExpansion } from "../../hooks/useFieldTreeExpansion";
import {
  childFields,
  objectFields,
  isExpandable,
} from "../../lib/graphqlSchemaTree";
import { pathKey, type FieldPath, type OperationType } from "../../lib/graphqlSelection";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface FieldTreeProps {
  rootType: GraphQLObjectType;
  opType: OperationType;
  availableOps: OperationType[];
  rootFieldCounts: Record<OperationType, number>;
  onOpType: (opType: OperationType) => void;
  isSelected: (path: FieldPath) => boolean;
  onToggle: (path: FieldPath, on: boolean) => void;
  /** Root-level pick: generates a schema skeleton (args + first-level scalars). */
  onPickRoot: (fieldName: string, on: boolean) => void;
  onFocusType: (typeName: string) => void;
}

/** The recursive checkbox field tree (mock's `.tree-col`). A real role="tree";
 *  children render lazily only when their parent is expanded, and a visited-type
 *  guard per branch stops runaway recursion on self-referential types. The
 *  header carries the visible Query/Mutation/Subscription section switcher. */
export function FieldTree({
  rootType,
  opType,
  availableOps,
  rootFieldCounts,
  onOpType,
  isSelected,
  onToggle,
  onPickRoot,
  onFocusType,
}: FieldTreeProps) {
  const t = useT();
  const expansion = useFieldTreeExpansion();
  const [filter, setFilter] = useState("");

  function renderNodes(
    fields: GraphQLField<unknown, unknown>[],
    parentPath: FieldPath,
    depth: number,
    visited: Set<string>,
  ): React.ReactNode {
    return fields.map((field) => {
      const path = [...parentPath, field.name];
      const expandable = isExpandable(field);
      const expanded = expansion.isExpanded(path);
      const typeName = field.type.toString().replace(/[[\]!]/g, "");
      const cycles = visited.has(typeName);
      // Root-level checkboxes generate a runnable skeleton; nested ones use the
      // plain path toggle (the parent already carries the selection context).
      const handleToggle =
        depth === 1
          ? (p: FieldPath, on: boolean) => onPickRoot(p[p.length - 1]!, on)
          : onToggle;
      return (
        <div key={pathKey(path)}>
          <FieldTreeNode
            field={field}
            path={path}
            depth={depth}
            selected={isSelected(path)}
            expanded={expanded}
            onToggle={handleToggle}
            onExpand={expansion.toggleExpand}
            onFocusType={onFocusType}
          />
          {expandable && expanded && !cycles && (
            <div role="group">
              {renderNodes(
                childFields(field),
                path,
                depth + 1,
                new Set([...visited, typeName]),
              )}
            </div>
          )}
        </div>
      );
    });
  }

  const allRootFields = objectFields(rootType);
  const needle = filter.trim().toLowerCase();
  const rootFields =
    needle === ""
      ? allRootFields
      : allRootFields.filter(
          (field) =>
            field.name.toLowerCase().includes(needle) ||
            field.type.toString().toLowerCase().includes(needle),
        );

  return (
    <div className="gql-col tree-col">
      <OperationSections
        opType={opType}
        available={availableOps}
        counts={rootFieldCounts}
        onChange={onOpType}
      />
      <div className="gql-tree-search">
        <Icon name="i-search" size={13} />
        <input
          type="search"
          value={filter}
          placeholder={t("graphql.searchFields")}
          aria-label={t("graphql.searchFields")}
          onChange={(event) => setFilter(event.target.value)}
        />
        {needle !== "" && (
          <span className="lok-tnums" style={{ fontSize: "var(--lok-fs-2xs)" }}>
            {rootFields.length}/{allRootFields.length}
          </span>
        )}
      </div>
      <div className="col-body lok-scroll" role="tree" aria-label={t("graphql.schemaFields")}>
        <div className="f field-type" aria-hidden="true">
          {rootType.name}
        </div>
        {rootFields.length > 0 ? (
          renderNodes(rootFields, [], 1, new Set([rootType.name]))
        ) : (
          <EmptyState
            compact
            headline={t("graphql.noOperationFields", {
              op: t(
                opType === "mutation"
                  ? "graphql.opMutation"
                  : opType === "subscription"
                    ? "graphql.opSubscription"
                    : "graphql.opQuery",
              ),
            })}
            hint={t("graphql.noOperationFieldsHint")}
            icon={<Icon name="i-graph" size={18} />}
          />
        )}
      </div>
    </div>
  );
}
