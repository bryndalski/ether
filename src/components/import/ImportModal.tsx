import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { useWorkbenchActions } from "../../state/useWorkbenchActions";
import { useToast } from "../../state/useToast";
import { useImport } from "../../hooks/useImport";
import { useNewRequest } from "../../hooks/useNewRequest";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { RequestSpec } from "../../lib/types";
import { Icon } from "../common/Icon";
import { TabBar } from "../common/TabBar";
import { PasteCurlTab } from "./PasteCurlTab";
import { ImportFileTab } from "./ImportFileTab";
import { ScanHistoryTab } from "./ScanHistoryTab";
import { useT } from "../../i18n/useT";
import "./import.css";

// Stable tab keys (locale-independent) mapped to their i18n label keys.
const TAB_KEYS = ["curl", "file", "history"] as const;
type ImportTab = (typeof TAB_KEYS)[number];
const TAB_LABEL_KEY = {
  curl: "import.pasteCurlTab",
  file: "import.importFileTab",
  history: "import.scanHistoryTab",
} as const;

/** Import modal with three tabs (paste cURL / import file / scan history).
 *  Copies the EnvironmentManager modal contract; adds a real shared focus-trap.
 *  All logic sits in useImport; the tabs are dumb. */
export function ImportModal() {
  const open = useUiStore((state) => state.importOpen);
  const close = useUiStore((state) => state.closeImport);
  const load = useCollectionsStore((state) => state.load);
  const importSpecOnDraft = useWorkbenchActions((state) => state.importSpec);
  const newRequest = useNewRequest();
  const show = useToast((state) => state.show);
  const api = useImport();
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ImportTab>("curl");

  const activeRequestPresent = useCollectionsStore(
    (state) => state.activeRequestId != null,
  );

  useFocusTrap(cardRef, { active: open, onClose: close });

  useEffect(() => {
    if (open) {
      api.reset();
      setTab("curl");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const loadSpec = (spec: RequestSpec, mode: "current" | "new") => {
    if (mode === "new" || !importSpecOnDraft) newRequest();
    // The workbench re-registers importSpec on the fresh draft synchronously via
    // its effect; read it fresh so a "new request" placement targets the new draft.
    const apply = useWorkbenchActions.getState().importSpec ?? importSpecOnDraft;
    apply?.(spec);
    show(t("import.importedFromCurl"), "success");
    close();
  };

  return (
    <div
      className="import-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={cardRef}
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("import.modalAria")}
        tabIndex={-1}
      >
        <div className="import-modal-head">
          <span className="import-modal-title">{t("import.modalTitle")}</span>
          <button
            type="button"
            className="import-modal-close"
            aria-label={t("import.close")}
            onClick={close}
          >
            <Icon name="i-x" size={16} />
          </button>
        </div>

        <TabBar
          tabs={TAB_KEYS.map((key) => t(TAB_LABEL_KEY[key]))}
          active={t(TAB_LABEL_KEY[tab])}
          onSelect={(label) => {
            const key = TAB_KEYS.find((k) => t(TAB_LABEL_KEY[k]) === label);
            if (key) setTab(key);
          }}
        />

        {tab === "curl" && (
          <PasteCurlTab
            api={api}
            activeRequestPresent={activeRequestPresent}
            onLoadSpec={loadSpec}
          />
        )}
        {tab === "file" && (
          <ImportFileTab
            api={api}
            onSaved={(requests, collections) => {
              void load();
              show(
                t("import.done", { requests, collections }),
                "success",
              );
              close();
            }}
            onError={(message) => show(message, "danger")}
          />
        )}
        {tab === "history" && (
          <ScanHistoryTab
            api={api}
            activeRequestPresent={activeRequestPresent}
            onLoadSpec={loadSpec}
          />
        )}
      </div>
    </div>
  );
}
