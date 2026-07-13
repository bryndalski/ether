import { useT } from "../../i18n/useT";
import { useUiStore, type AppMode } from "../../state/useUiStore";

/** Segmented control in the titlebar switching Requests ⇄ Workflows. Keyboard-
 *  focusable, `aria-pressed` on each tab; the active tab gets the heat accent line
 *  (the design system's active-tab treatment). */
export function ModeTabs() {
  const t = useT();
  const mode = useUiStore((state) => state.mode);
  const setMode = useUiStore((state) => state.setMode);

  const tabs: { value: AppMode; label: string }[] = [
    { value: "requests", label: t("workflow.modeRequests") },
    { value: "workflows", label: t("workflow.modeWorkflows") },
  ];

  return (
    <div
      className="lok-mode-tabs"
      role="group"
      aria-label={t("workflow.modeSwitchAria")}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className="lok-mode-tab"
          aria-pressed={mode === tab.value}
          data-active={mode === tab.value}
          onClick={() => setMode(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
