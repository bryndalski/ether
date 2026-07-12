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
import "./import.css";

const TABS = ["Wklej cURL", "Importuj plik", "Skanuj historię"] as const;
type ImportTab = (typeof TABS)[number];

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
  const cardRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ImportTab>("Wklej cURL");

  const activeRequestPresent = useCollectionsStore(
    (state) => state.activeRequestId != null,
  );

  useFocusTrap(cardRef, { active: open, onClose: close });

  useEffect(() => {
    if (open) {
      api.reset();
      setTab("Wklej cURL");
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
    show("Zaimportowano z cURL", "success");
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
        aria-label="Importuj"
        tabIndex={-1}
      >
        <div className="import-modal-head">
          <span className="import-modal-title">Importuj</span>
          <button
            type="button"
            className="import-modal-close"
            aria-label="Zamknij"
            onClick={close}
          >
            <Icon name="i-x" size={16} />
          </button>
        </div>

        <TabBar
          tabs={[...TABS]}
          active={tab}
          onSelect={(next) => setTab(next as ImportTab)}
        />

        {tab === "Wklej cURL" && (
          <PasteCurlTab
            api={api}
            activeRequestPresent={activeRequestPresent}
            onLoadSpec={loadSpec}
          />
        )}
        {tab === "Importuj plik" && (
          <ImportFileTab
            api={api}
            onSaved={(requests, collections) => {
              void load();
              show(
                `Zaimportowano ${requests} requestów do ${collections} kolekcji`,
                "success",
              );
              close();
            }}
            onError={(message) => show(message, "danger")}
          />
        )}
        {tab === "Skanuj historię" && (
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
