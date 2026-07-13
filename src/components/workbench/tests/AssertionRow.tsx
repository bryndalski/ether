import type { Assertion, AssertionType } from "../../../lib/types";
import { defaultAssertion } from "../../../lib/assertionDefaults";
import { Icon } from "../../common/Icon";
import { AssertionTypeSelect } from "./AssertionTypeSelect";
import { AssertionFields } from "./AssertionFields";

interface AssertionRowProps {
  assertion: Assertion;
  index: number;
  onChange: (assertion: Assertion) => void;
  onRemove: () => void;
}

/** One assertion: enable checkbox + type menu + type-driven fields + remove. */
export function AssertionRow({ assertion, index, onChange, onRemove }: AssertionRowProps) {
  const label = `asercja ${index + 1}`;
  return (
    <div className="test-row" data-disabled={assertion.enabled ? undefined : "true"}>
      <input
        type="checkbox"
        checked={assertion.enabled}
        aria-label={`Włącz ${label}`}
        onChange={(event) => onChange({ ...assertion, enabled: event.target.checked })}
      />
      <AssertionTypeSelect
        value={assertion.type}
        index={index}
        onChange={(type: AssertionType) =>
          onChange({ ...defaultAssertion(type), enabled: assertion.enabled })
        }
      />
      <div className="test-fields">
        <AssertionFields assertion={assertion} index={index} onChange={onChange} />
      </div>
      <button type="button" className="rm" aria-label={`Usuń ${label}`} onClick={onRemove}>
        <Icon name="i-x" size={13} />
      </button>
    </div>
  );
}
