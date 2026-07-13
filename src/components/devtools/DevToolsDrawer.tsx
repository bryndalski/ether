import { useEffect, useRef } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useT } from "../../i18n/useT";
import { DevToolsDrawerHeader } from "./DevToolsDrawerHeader";
import { JwtPasteDecoder } from "./JwtPasteDecoder";
import "./devtools.css";

/** Right-side slide-over hosting standalone tools reachable with no active
 *  response (same pattern as HistoryDrawer: role=dialog, aria-modal,
 *  Escape/scrim close, only the inner body scrolls). */
export function DevToolsDrawer() {
  const open = useUiStore((state) => state.devToolsOpen);
  const close = useUiStore((state) => state.closeDevTools);
  const t = useT();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dv-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={drawerRef}
        className="dv-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dv-drawer-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <DevToolsDrawerHeader onClose={close} />
        <div className="dv-drawer-body lok-scroll">
          <section className="dv-drawer-section">
            <h3 className="dv-drawer-subtitle">{t("devtools.jwtDecoder")}</h3>
            <JwtPasteDecoder />
          </section>
        </div>
      </div>
    </div>
  );
}
