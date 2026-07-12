import type { CSSProperties } from "react";
import type { Environment } from "../../lib/types";

interface EnvQuickLookProps {
  environment: Environment;
}

const surface: CSSProperties = {
  backgroundColor: "var(--lok-bg-overlay)",
  border: "1px solid var(--lok-border-default)",
  borderRadius: "var(--lok-radius-md)",
  boxShadow: "var(--lok-shadow-md)",
  minWidth: 240,
};

/** Hover popover listing env variables; secret values are always masked. */
export function EnvQuickLook({ environment }: EnvQuickLookProps) {
  const secretSet = new Set(environment.secret_names);
  const rows = [
    ...environment.variables.map((variable) => ({
      name: variable.name,
      value: secretSet.has(variable.name) ? "••••••••" : variable.value,
      secret: secretSet.has(variable.name),
    })),
    ...environment.secret_names
      .filter((name) => !environment.variables.some((v) => v.name === name))
      .map((name) => ({ name, value: "••••••••", secret: true })),
  ];

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
              style={{ fontSize: "var(--lok-fs-xs)" }}
            >
              <span style={{ color: "var(--lok-syn-key)" }}>{row.name}</span>
              <span
                style={{
                  color: row.secret
                    ? "var(--lok-text-tertiary)"
                    : "var(--lok-text-secondary)",
                }}
              >
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
