import { useCallback, useEffect, useRef, useState } from "react";
import { useHistoryStore } from "../../state/useHistoryStore";
import type { HistoryScope } from "../../state/useHistoryStore";
import { HistoryDrawerHeader } from "./HistoryDrawerHeader";
import { CompareBar } from "./CompareBar";
import { HistoryList } from "./HistoryList";
import { DiffPanel } from "./DiffPanel";
import "./history.css";

interface HistoryDrawerProps {
  activeRequestId: string | null;
  onReplay: (id: string) => void;
}

/** Right-side slide-over history drawer (role=dialog, aria-modal, Escape/scrim
 *  close). Only HistoryList / DiffPanel scroll — the chrome is fixed. */
export function HistoryDrawer({ activeRequestId, onReplay }: HistoryDrawerProps) {
  const open = useHistoryStore((state) => state.drawerOpen);
  const scope = useHistoryStore((state) => state.scope);
  const diffOpen = useHistoryStore((state) => state.diffOpen);
  const selectedIds = useHistoryStore((state) => state.selectedIds);
  const close = useHistoryStore((state) => state.close);
  const setScope = useHistoryStore((state) => state.setScope);
  const load = useHistoryStore((state) => state.load);
  const clear = useHistoryStore((state) => state.clear);
  const clearSelection = useHistoryStore((state) => state.clearSelection);
  const openDiff = useHistoryStore((state) => state.openDiff);
  const closeDiff = useHistoryStore((state) => state.closeDiff);
  const entryById = useHistoryStore((state) => state.entryById);

  const drawerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // One shared clock so all relative-time labels stay consistent.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // (Re)load whenever opened or the scope changes.
  useEffect(() => {
    if (open) void load(activeRequestId, useHistoryStore.getState().limit);
  }, [open, scope, activeRequestId, load]);

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  const onScope = useCallback(
    (next: HistoryScope) => setScope(next),
    [setScope],
  );

  if (!open) return null;

  const [a, b] = selectedIds.map((id) => entryById(id));

  return (
    <div
      className="hist-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={drawerRef}
        className="hist-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hist-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <HistoryDrawerHeader
          scope={scope}
          scopeDisabled={activeRequestId === null}
          onScope={onScope}
          onClear={() => void clear()}
          onClose={close}
        />
        {diffOpen && a && b ? (
          <DiffPanel a={a} b={b} now={now} onClose={closeDiff} />
        ) : (
          <>
            <CompareBar
              selectedCount={selectedIds.length}
              onCompare={openDiff}
              onClear={clearSelection}
            />
            <HistoryList now={now} onReplay={onReplay} />
          </>
        )}
      </div>
    </div>
  );
}
