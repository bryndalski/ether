import { Icon } from "../common/Icon";

interface RequestTypeToggleProps {
  isGraphql: boolean;
  onSelect: (graphql: boolean) => void;
}

/** Segmented REST | GraphQL control. A real tablist; never color-only (each tab
 *  pairs a label with an icon). The discriminator remains draft.graphql. */
export function RequestTypeToggle({ isGraphql, onSelect }: RequestTypeToggleProps) {
  return (
    <div className="reqtype-toggle" role="tablist" aria-label="Typ requestu">
      <button
        type="button"
        role="tab"
        aria-selected={!isGraphql}
        onClick={() => onSelect(false)}
      >
        <Icon name="i-braces" size={13} />
        REST
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isGraphql}
        onClick={() => onSelect(true)}
      >
        <Icon name="i-graph" size={13} />
        GraphQL
      </button>
    </div>
  );
}
