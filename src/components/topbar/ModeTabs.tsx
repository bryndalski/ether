import { useT } from "../../i18n/useT";
import { useUiStore, type AppMode } from "../../state/useUiStore";
import { Icon, type IconName } from "../common/Icon";

/** Segmented control in the titlebar switching Requests ⇄ Workflows. A sliding
 *  thumb (CSS ::before, driven by data-mode) marks the active segment; each tab
 *  pairs an icon with its label so the state never reads by position alone. */
export function ModeTabs() {
  const t = useT();
  const mode = useUiStore((state) => state.mode);
  const setMode = useUiStore((state) => state.setMode);

  const tabs: { value: AppMode; label: string; icon: IconName }[] = [
    { value: "requests", label: t("workflow.modeRequests"), icon: "i-send" },
    { value: "workflows", label: t("workflow.modeWorkflows"), icon: "i-flow" },
  ];

  return (
    <div
      className="lok-mode-tabs"
      role="group"
      aria-label={t("workflow.modeSwitchAria")}
      data-mode={mode}
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
          <Icon name={tab.icon} size={13} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
