import type { GraphQLField } from "graphql";
import { Icon } from "../common/Icon";
import {
  fieldTypeLabel,
  hasArgs as fieldHasArgs,
  isExpandable,
} from "../../lib/graphqlSchemaTree";
import type { FieldPath } from "../../lib/graphqlSelection";

interface FieldTreeNodeProps {
  field: GraphQLField<unknown, unknown>;
  path: FieldPath;
  depth: number;
  selected: boolean;
  expanded: boolean;
  onToggle: (path: FieldPath, on: boolean) => void;
  onExpand: (path: FieldPath) => void;
  onFocusType: (typeName: string) => void;
}

/** One field row (mock's `.f`): optional chevron for object fields + checkbox +
 *  name + `(args): Type`. A real treeitem with aria-expanded/selected/level. */
export function FieldTreeNode({
  field,
  path,
  depth,
  selected,
  expanded,
  onToggle,
  onExpand,
  onFocusType,
}: FieldTreeNodeProps) {
  const expandable = isExpandable(field);
  const withArgs = fieldHasArgs(field);
  const indentClass = depth === 1 ? "indent" : depth >= 2 ? "indent2" : "";
  const typeName = field.type.toString().replace(/[[\]!]/g, "");

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      className={`f ${indentClass}${selected ? " on" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && expandable && !expanded) {
          event.preventDefault();
          onExpand(path);
        } else if (event.key === "ArrowLeft" && expandable && expanded) {
          event.preventDefault();
          onExpand(path);
        }
      }}
    >
      {expandable ? (
        <button
          type="button"
          className={expanded ? "chev" : "chevr"}
          aria-label={expanded ? "Zwiń pole" : "Rozwiń pole"}
          onClick={() => onExpand(path)}
        >
          <Icon name={expanded ? "i-chev" : "i-chevr"} size={12} />
        </button>
      ) : (
        <span className="chev-spacer" aria-hidden="true" />
      )}
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Zaznacz pole ${field.name}`}
        onChange={(event) => onToggle(path, event.target.checked)}
      />
      <span className="fname">{field.name}</span>
      <button
        type="button"
        className="ftype"
        title={withArgs ? "Pokaż typ w dokumentacji" : "Pokaż typ"}
        onClick={() => onFocusType(typeName)}
      >
        {fieldTypeLabel(field)}
      </button>
    </div>
  );
}
