import { useCallback, useEffect, useState } from "react";
import type { ImportApi } from "../../hooks/useImport";
import type { RequestSpec } from "../../lib/types";
import { EmptyState } from "../common/EmptyState";
import { ScanHistoryList } from "./ScanHistoryList";
import { useT } from "../../i18n/useT";

interface ScanHistoryTabProps {
  api: ImportApi;
  activeRequestPresent: boolean;
  onLoadSpec: (spec: RequestSpec, mode: "current" | "new") => void;
}

const SCAN_LIMIT = 200;

/** Scan the shell history for curl commands → pick one → from_curl → draft.
 *  Never auto-executes a scanned curl; only loads it into a draft. */
export function ScanHistoryTab({
  api,
  activeRequestPresent,
  onLoadSpec,
}: ScanHistoryTabProps) {
  const t = useT();
  const [commands, setCommands] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);

  const scan = useCallback(async () => {
    const found = await api.scanHistory(SCAN_LIMIT);
    setCommands(found);
    setScanned(true);
  }, [api]);

  useEffect(() => {
    void scan();
  }, [scan]);

  async function pick(command: string) {
    const spec = await api.parseCurl(command);
    if (spec) onLoadSpec(spec, activeRequestPresent ? "current" : "new");
  }

  return (
    <div
      className="import-modal-body"
      role="tabpanel"
      aria-label={t("import.scanHistoryTab")}
    >
      <div className="import-row">
        <span className="import-label">{t("import.scanIntro")}</span>
        <button
          type="button"
          className="import-btn ghost"
          style={{ marginLeft: "auto" }}
          onClick={() => void scan()}
        >
          {t("import.scanAgain")}
        </button>
      </div>
      {scanned && commands.length === 0 ? (
        <EmptyState
          headline={t("import.noCurlHeadline")}
          hint={t("import.noCurlInHistory")}
          icon="~"
        />
      ) : (
        <ScanHistoryList commands={commands} onPick={(cmd) => void pick(cmd)} />
      )}
    </div>
  );
}
