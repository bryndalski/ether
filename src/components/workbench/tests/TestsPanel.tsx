import type { Assertion, ScrubConfig } from "../../../lib/types";
import { AssertionList } from "./AssertionList";
import { SnapshotConfigCard } from "./SnapshotConfigCard";

interface TestsPanelProps {
  assertions: Assertion[];
  onAssertionsChange: (assertions: Assertion[]) => void;
  scrubConfig: ScrubConfig;
  onScrubConfigChange: (config: ScrubConfig) => void;
}

/** The "Tests" request tab: define scriptless assertions + snapshot scrub config. */
export function TestsPanel({
  assertions,
  onAssertionsChange,
  scrubConfig,
  onScrubConfigChange,
}: TestsPanelProps) {
  return (
    <div className="tests-panel lok-scroll" role="tabpanel" aria-label="Testy">
      <h3 className="test-heading">Asercje odpowiedzi</h3>
      <p className="test-hint">
        Deklaratywne sprawdzenia po każdej wysyłce — bez skryptów, stały zestaw
        typów.
      </p>
      <AssertionList assertions={assertions} onChange={onAssertionsChange} />
      <SnapshotConfigCard config={scrubConfig} onChange={onScrubConfigChange} />
    </div>
  );
}
