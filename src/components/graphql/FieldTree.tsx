import type { GraphQLField, GraphQLObjectType } from "graphql";
import { FieldTreeNode } from "./FieldTreeNode";
import { useFieldTreeExpansion } from "../../hooks/useFieldTreeExpansion";
import {
  childFields,
  objectFields,
  isExpandable,
} from "../../lib/graphqlSchemaTree";
import { pathKey, type FieldPath } from "../../lib/graphqlSelection";
import { Icon } from "../common/Icon";

interface FieldTreeProps {
  rootType: GraphQLObjectType;
  isSelected: (path: FieldPath) => boolean;
  onToggle: (path: FieldPath, on: boolean) => void;
  onFocusType: (typeName: string) => void;
}

/** The recursive checkbox field tree (mock's `.tree-col`). A real role="tree";
 *  children render lazily only when their parent is expanded, and a visited-type
 *  guard per branch stops runaway recursion on self-referential types. */
export function FieldTree({
  rootType,
  isSelected,
  onToggle,
  onFocusType,
}: FieldTreeProps) {
  const expansion = useFieldTreeExpansion();

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
      return (
        <div key={pathKey(path)}>
          <FieldTreeNode
            field={field}
            path={path}
            depth={depth}
            selected={isSelected(path)}
            expanded={expanded}
            onToggle={onToggle}
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

  return (
    <div className="gql-col tree-col">
      <div className="col-head">
        Fields
        <span className="spacer" />
        <Icon name="i-book" size={13} />
      </div>
      <div className="col-body lok-scroll" role="tree" aria-label="Pola schematu">
        <div className="f field-type" aria-hidden="true">
          <Icon name="i-chev" size={12} />
          {rootType.name}
        </div>
        {renderNodes(objectFields(rootType), [], 1, new Set([rootType.name]))}
      </div>
    </div>
  );
}
