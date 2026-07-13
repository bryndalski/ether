import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

export type ResponseTabKey =
  | "Body"
  | "Headers"
  | "Timeline"
  | "curl -v"
  | "Tests"
  | "Snapshot"
  | "Watch"
  | "Bench"
  | "Cert"
  | "JWT";

const BASE_TABS: ResponseTabKey[] = ["Body", "Headers", "Timeline", "curl -v"];

interface ResponseTabsProps {
  active: ResponseTabKey;
  onSelect: (tab: ResponseTabKey) => void;
  headerCount: number;
  onCopy: () => void;
  showBench: boolean;
  showCert: boolean;
  jwtCount: number;
  assertionSummary: string | null;
  showSnapshot: boolean;
  showWatch: boolean;
}

/** Response tab strip: Body / Headers / Timeline / curl -v plus the conditional
 *  dev-utils tabs (Bench / Cert / JWT — only when their data exists). */
export function ResponseTabs({
  active,
  onSelect,
  headerCount,
  onCopy,
  showBench,
  showCert,
  jwtCount,
  assertionSummary,
  showSnapshot,
  showWatch,
}: ResponseTabsProps) {
  const t = useT();
  const tabs: ResponseTabKey[] = [...BASE_TABS];
  if (assertionSummary !== null) tabs.push("Tests");
  if (showSnapshot) tabs.push("Snapshot");
  if (showWatch) tabs.push("Watch");
  if (showBench) tabs.push("Bench");
  if (showCert) tabs.push("Cert");
  if (jwtCount > 0) tabs.push("JWT");

  return (
    <div className="resp-tabs" role="tablist">
      {tabs.map((tab) => {
        const selected = tab === active;
        const showHeaderCount = tab === "Headers" && headerCount > 0;
        const showJwtCount = tab === "JWT" && jwtCount > 0;
        const showAssertChip = tab === "Tests" && assertionSummary !== null;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? "tab active" : "tab"}
            onClick={() => onSelect(tab)}
          >
            {tab}
            {showHeaderCount && <span className="count">{headerCount}</span>}
            {showJwtCount && <span className="count">{jwtCount}</span>}
            {showAssertChip && <span className="count">{assertionSummary}</span>}
          </button>
        );
      })}
      <button
        type="button"
        className="tab"
        aria-label={t("response.copyResponse")}
        style={{ marginLeft: "auto" }}
        onClick={onCopy}
      >
        <Icon name="i-copy" size={13} />
      </button>
    </div>
  );
}
