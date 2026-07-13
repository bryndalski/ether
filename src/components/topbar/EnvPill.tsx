import { envKind } from "../../state/useEnvStore";
import { useUiStore } from "../../state/useUiStore";
import { useEnvPill } from "../../hooks/useEnvPill";
import { HealthDot } from "../common/HealthDot";
import { EnvDropdown } from "./EnvDropdown";
import { EnvQuickLook } from "./EnvQuickLook";
import { useT } from "../../i18n/useT";

/** Env-switcher pill: health dot + name + caret. Colored by active env accent,
 *  hover reveals a quick-look popover, click opens the picker dropdown. */
export function EnvPill() {
  const {
    environments,
    activeEnvironment,
    activeEnvironmentId,
    dropdownOpen,
    quickLookOpen,
    toggleDropdown,
    openQuickLook,
    closeQuickLook,
    select,
    closeDropdown,
  } = useEnvPill();
  const openEnvManager = useUiStore((state) => state.openEnvManager);
  const t = useT();

  const kind = envKind(activeEnvironment);
  const label = activeEnvironment?.name ?? t("topbar.noEnvironment");

  return (
    <div
      className="relative"
      data-env={kind}
      onMouseEnter={() => activeEnvironment && openQuickLook()}
      onMouseLeave={closeQuickLook}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        onClick={toggleDropdown}
        className="flex items-center gap-2 rounded-[var(--lok-radius-full)] px-3 py-1 transition-colors"
        style={{
          fontSize: "var(--lok-fs-sm)",
          color: "var(--lok-text-primary)",
          border: "1px solid var(--lok-env-accent)",
          backgroundColor: "color-mix(in srgb, var(--lok-env-accent) 14%, transparent)",
        }}
      >
        <HealthDot health={kind === "prod" ? "checking" : "up"} />
        <span className="max-w-[120px] truncate">{label}</span>
        <span aria-hidden style={{ color: "var(--lok-text-tertiary)" }}>
          ▾
        </span>
      </button>

      {quickLookOpen && !dropdownOpen && activeEnvironment && (
        <EnvQuickLook environment={activeEnvironment} />
      )}
      {dropdownOpen && (
        <EnvDropdown
          environments={environments}
          activeId={activeEnvironmentId}
          onSelect={select}
          onManage={() => {
            closeDropdown();
            openEnvManager();
          }}
        />
      )}
    </div>
  );
}
