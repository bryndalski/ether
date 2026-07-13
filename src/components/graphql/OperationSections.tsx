import type { OperationType } from "../../lib/graphqlSelection";
import { useT } from "../../i18n/useT";

interface OperationSectionsProps {
  opType: OperationType;
  available: OperationType[];
  counts: Record<OperationType, number>;
  onChange: (opType: OperationType) => void;
}

const ORDER: OperationType[] = ["query", "mutation", "subscription"];

// Distinct hues so an operation section is never identified by position alone:
// Query = the GraphQL brand hue, Mutation = warn, Subscription = info.
const HUE: Record<OperationType, string> = {
  query: "var(--lok-syn-gql)",
  mutation: "var(--lok-status-warn)",
  subscription: "var(--lok-status-info)",
};

const LABEL_KEY: Record<OperationType, "opQuery" | "opMutation" | "opSubscription"> = {
  query: "opQuery",
  mutation: "opMutation",
  subscription: "opSubscription",
};

/** The visible Query / Mutation / Subscription section switcher above the field
 *  tree. Every operation type is always shown (unsupported ones disabled, not
 *  hidden) with a colored badge and its root-field count — so mutations are
 *  discoverable even when the current view shows the query root. */
export function OperationSections({
  opType,
  available,
  counts,
  onChange,
}: OperationSectionsProps) {
  const t = useT();
  return (
    <div
      className="gql-op-sections"
      role="tablist"
      aria-label={t("graphql.operationSectionsAria")}
    >
      {ORDER.map((type) => {
        const enabled = available.includes(type);
        const selected = opType === type;
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={!enabled}
            className={`gql-op-tab${selected ? " active" : ""}`}
            title={
              enabled ? undefined : t("graphql.operationMissing", { op: type })
            }
            style={{ ["--op-hue" as string]: HUE[type] }}
            onClick={() => enabled && onChange(type)}
          >
            <span className="gql-op-dot" aria-hidden="true" />
            <span className="gql-op-name">{t(`graphql.${LABEL_KEY[type]}`)}</span>
            <span className="gql-op-count" aria-hidden="true">
              {counts[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
