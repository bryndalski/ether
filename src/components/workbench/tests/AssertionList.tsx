import type { Assertion } from "../../../lib/types";
import { defaultAssertion } from "../../../lib/assertionDefaults";
import { Icon } from "../../common/Icon";
import { AssertionRow } from "./AssertionRow";
import { useT } from "../../../i18n/useT";

interface AssertionListProps {
  assertions: Assertion[];
  onChange: (assertions: Assertion[]) => void;
}

/** The editable list of assertions. Add appends a default `status_equals`. */
export function AssertionList({ assertions, onChange }: AssertionListProps) {
  const t = useT();
  function patch(index: number, next: Assertion) {
    onChange(assertions.map((a, i) => (i === index ? next : a)));
  }
  function remove(index: number) {
    onChange(assertions.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...assertions, defaultAssertion("status_equals")]);
  }

  return (
    <div>
      {assertions.map((assertion, index) => (
        <AssertionRow
          key={index}
          assertion={assertion}
          index={index}
          onChange={(next) => patch(index, next)}
          onRemove={() => remove(index)}
        />
      ))}
      <button type="button" className="test-add" onClick={add}>
        <Icon name="i-plus" size={13} />
        {t("tests.addAssertion")}
      </button>
    </div>
  );
}
