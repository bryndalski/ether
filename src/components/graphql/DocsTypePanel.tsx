import type { GraphQLNamedType } from "graphql";
import { getNamedType, isEnumType, isInputObjectType, isObjectType, isInterfaceType } from "graphql";
import { docKind } from "../../lib/graphqlSchemaTree";

interface DocsTypePanelProps {
  type: GraphQLNamedType;
  onFocusType: (typeName: string) => void;
}

/** Renders the focused type: a `type User` header + each field as `name: Type`
 *  with description. Field type names are keyboard-reachable buttons that focus
 *  that type (mirrors the pointer-only Cmd-click). */
export function DocsTypePanel({ type, onFocusType }: DocsTypePanelProps) {
  const kind = docKind(type);
  const header =
    kind === "object" || kind === "interface"
      ? `type ${type.name}`
      : kind === "enum"
        ? `enum ${type.name}`
        : kind === "input"
          ? `input ${type.name}`
          : kind === "scalar"
            ? `scalar ${type.name}`
            : type.name;

  return (
    <div>
      <div className="doc-type">{header}</div>
      {type.description && <div className="doc-desc">{type.description}</div>}

      {(isObjectType(type) || isInterfaceType(type)) &&
        Object.values(type.getFields()).map((field) => {
          const namedType = getNamedType(field.type).name;
          return (
            <div className="doc-field" key={field.name}>
              <div className="name">
                <span className="n">{field.name}</span>
                {": "}
                <button
                  type="button"
                  className="t"
                  onClick={() => onFocusType(namedType)}
                >
                  {field.type.toString()}
                </button>
              </div>
              {field.description && <div className="desc">{field.description}</div>}
            </div>
          );
        })}

      {isEnumType(type) &&
        type.getValues().map((value) => (
          <div className="doc-field" key={value.name}>
            <div className="name">
              <span className="n">{value.name}</span>
            </div>
            {value.description && <div className="desc">{value.description}</div>}
          </div>
        ))}

      {isInputObjectType(type) &&
        Object.values(type.getFields()).map((field) => {
          const namedType = getNamedType(field.type).name;
          return (
            <div className="doc-field" key={field.name}>
              <div className="name">
                <span className="n">{field.name}</span>
                {": "}
                <button
                  type="button"
                  className="t"
                  onClick={() => onFocusType(namedType)}
                >
                  {field.type.toString()}
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
