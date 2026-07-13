import type { Assertion, ScrubConfig } from "../../../lib/types";
import { AssertionList } from "./AssertionList";
import { SnapshotConfigCard } from "./SnapshotConfigCard";
import { useT } from "../../../i18n/useT";

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
  const t = useT();
  return (
    <div className="tests-panel lok-scroll" role="tabpanel" aria-label={t("tests.tabAria")}>
      <h3 className="test-heading">{t("tests.responseAssertions")}</h3>
      <p className="test-hint">{t("tests.intro")}</p>
      <AssertionList assertions={assertions} onChange={onAssertionsChange} />
      <SnapshotConfigCard config={scrubConfig} onChange={onScrubConfigChange} />
    </div>
  );
}
