import { useMemo, type CSSProperties } from "react";
import type { Environment } from "../../lib/types";
import { useEnvStore } from "../../state/useEnvStore";
import { mergedVars } from "../../lib/envMerge";

interface EnvQuickLookProps {
  environment: Environment;
}

const surface: CSSProperties = {
  backgroundColor: "var(--lok-bg-overlay)",
  border: "1px solid var(--lok-border-default)",
  borderRadius: "var(--lok-radius-md)",
  boxShadow: "var(--lok-shadow-md)",
  minWidth: 260,
};

/** Hover popover listing the MERGED (base → sub) variables the request resolves
 *  against. Secret values are always masked (they have no FE value anyway);
 *  inherited-only rows are tagged so overrides are visible. Mirrors Rust's
 *  child-overrides-parent precedence — display only, never a real send source. */
export function EnvQuickLook({ environment }: EnvQuickLookProps) {
  const environments = useEnvStore((state) => state.environments);
  const rows = useMemo(
    () => mergedVars(environments, environment.id),
    [environments, environment.id],
  );

  return (
    <div
      role="dialog"
      aria-label={`Zmienne środowiska ${environment.name}`}
      className="absolute right-0 top-full z-[var(--lok-z-dropdown)] mt-2 p-2"
      style={surface}
    >
      <p
        className="px-2 pb-2 uppercase"
        style={{
          color: "var(--lok-text-tertiary)",
          fontSize: "var(--lok-fs-2xs)",
          letterSpacing: "var(--lok-tracking-caps)",
        }}
      >
        {environment.name}
      </p>
      {rows.length === 0 ? (
        <p
          className="px-2 py-1"
          style={{
            color: "var(--lok-text-tertiary)",
            fontSize: "var(--lok-fs-xs)",
          }}
        >
          Brak zmiennych
        </p>
      ) : (
        <ul className="lok-mono flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-4 px-2 py-1"
              style={{
                fontSize: "var(--lok-fs-xs)",
                opacity: row.source === "inherited" ? 0.7 : 1,
              }}
            >
              <span className="flex items-center gap-1.5">
                <span style={{ color: "var(--lok-syn-key)" }}>{row.name}</span>
                {row.source === "inherited" && (
                  <span
                    className="uppercase"
                    style={{
                      color: "var(--lok-text-tertiary)",
                      fontSize: "var(--lok-fs-2xs)",
                      letterSpacing: "var(--lok-tracking-caps)",
                    }}
                  >
                    dziedziczone
                  </span>
                )}
              </span>
              <span
                style={{
                  color: row.isSecret
                    ? "var(--lok-text-tertiary)"
                    : "var(--lok-text-secondary)",
                }}
              >
                {row.isSecret ? "••••••••" : row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
