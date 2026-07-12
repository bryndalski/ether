import type { CSSProperties } from "react";
import { envKind } from "../../state/useEnvStore";
import type { Environment } from "../../lib/types";
import { HealthDot } from "../common/HealthDot";
import { Icon } from "../common/Icon";

interface EnvDropdownProps {
  environments: Environment[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onManage: () => void;
}

const surface: CSSProperties = {
  backgroundColor: "var(--lok-bg-overlay)",
  border: "1px solid var(--lok-border-default)",
  borderRadius: "var(--lok-radius-md)",
  boxShadow: "var(--lok-shadow-md)",
  minWidth: 220,
};

/** Environment picker list. Prod carries an explicit "PROD" label + icon so
 *  color is never the only danger signal. */
export function EnvDropdown({
  environments,
  activeId,
  onSelect,
  onManage,
}: EnvDropdownProps) {
  return (
    <ul
      role="listbox"
      aria-label="Wybierz środowisko"
      className="absolute right-0 top-full z-[var(--lok-z-dropdown)] mt-2 p-1"
      style={surface}
    >
      {environments.map((environment) => {
        const kind = envKind(environment);
        const active = environment.id === activeId;
        return (
          <li key={environment.id}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(environment.id)}
              data-env={kind}
              className="flex w-full items-center gap-2 rounded-[var(--lok-radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--lok-bg-hover)]"
              style={{
                fontSize: "var(--lok-fs-sm)",
                color: active
                  ? "var(--lok-text-primary)"
                  : "var(--lok-text-secondary)",
                backgroundColor: active ? "var(--lok-bg-selected)" : undefined,
              }}
            >
              <span
                aria-hidden
                className="shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "var(--lok-radius-full)",
                  backgroundColor: "var(--lok-env-accent)",
                }}
              />
              <span className="flex-1 truncate">{environment.name}</span>
              {kind === "prod" && (
                <span
                  className="flex items-center gap-1 uppercase"
                  style={{
                    color: "var(--lok-status-danger)",
                    fontSize: "var(--lok-fs-2xs)",
                    fontWeight: "var(--lok-fw-bold)",
                    letterSpacing: "var(--lok-tracking-caps)",
                  }}
                >
                  <HealthDot health="down" />
                  PROD
                </span>
              )}
            </button>
          </li>
        );
      })}
      <li
        role="presentation"
        style={{
          borderTop: "1px solid var(--lok-border-subtle)",
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={onManage}
          className="flex w-full items-center gap-2 rounded-[var(--lok-radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--lok-bg-hover)]"
          style={{
            fontSize: "var(--lok-fs-sm)",
            color: "var(--lok-text-secondary)",
          }}
        >
          <Icon name="i-settings" size={14} />
          Zarządzaj środowiskami…
        </button>
      </li>
    </ul>
  );
}
