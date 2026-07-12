import type { OperationType } from "../../lib/graphqlSelection";
import { Icon } from "../common/Icon";

interface OperationPickerProps {
  opType: OperationType;
  available: OperationType[];
  onChange: (opType: OperationType) => void;
}

const LABEL: Record<OperationType, string> = {
  query: "query",
  mutation: "mutation",
  subscription: "subscription",
};

/** Native <select> for the operation type — keyboard/a11y for free. Options the
 *  schema lacks (no Mutation/Subscription type) are disabled, not hidden, so the
 *  choice is never color-only and the absence is explained via title. */
export function OperationPicker({
  opType,
  available,
  onChange,
}: OperationPickerProps) {
  const all: OperationType[] = ["query", "mutation", "subscription"];
  return (
    <label className="op-select">
      <span className="op">{LABEL[opType]}</span>
      <Icon name="i-chev" size={13} />
      <select
        aria-label="Typ operacji GraphQL"
        value={opType}
        onChange={(event) => onChange(event.target.value as OperationType)}
        style={{
          position: "absolute",
          opacity: 0,
          inset: 0,
          width: "100%",
          cursor: "pointer",
        }}
      >
        {all.map((type) => {
          const enabled = available.includes(type);
          return (
            <option
              key={type}
              value={type}
              disabled={!enabled}
              title={enabled ? undefined : `Schema has no ${type} type`}
            >
              {LABEL[type]}
            </option>
          );
        })}
      </select>
    </label>
  );
}
