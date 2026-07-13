import { useMemo, useState } from "react";
import type { KeyValue } from "../../lib/types";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { countRequestsUsingVariable } from "../../lib/envUsage";
import { writeClipboard } from "../../lib/clipboard";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface EnvVariablesTableProps {
  variables: KeyValue[];
  onChange: (variables: KeyValue[]) => void;
}

const GHOST_ROW: KeyValue = { name: "", value: "", enabled: true };

/** Public (commit-safe) environment variables in the Postman/Insomnia key-value
 *  pattern: [checkbox][key 40%][value 60%][hover actions], dense ~34px rows with
 *  identical monospace inline inputs and a trailing ghost row that materializes
 *  on first edit (see common/kv-grid.css). Adds a name/value filter, a one-click
 *  `{{name}}` copy, and a "used by N requests" hint. Edits are optimistic in the
 *  store and persisted debounced/batched by useEnvManager, so typing is instant. */
export function EnvVariablesTable({ variables, onChange }: EnvVariablesTableProps) {
  const t = useT();
  const requests = useCollectionsStore((state) => state.requests);
  const [query, setQuery] = useState("");
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const filtering = needle !== "";
  // Filtering keeps original indices so edits map back to the real array. The
  // ghost row is only appended when NOT filtering (a search shouldn't add rows).
  const visible = useMemo(() => {
    const rows = variables
      .map((variable, index) => ({ variable, index, ghost: false }))
      .filter(
        ({ variable }) =>
          !filtering ||
          variable.name.toLowerCase().includes(needle) ||
          variable.value.toLowerCase().includes(needle),
      );
    if (!filtering) {
      rows.push({ variable: GHOST_ROW, index: variables.length, ghost: true });
    }
    return rows;
  }, [variables, needle, filtering]);

  const usageByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const variable of variables) {
      if (variable.name.trim() !== "" && !map.has(variable.name)) {
        map.set(variable.name, countRequestsUsingVariable(requests, variable.name));
      }
    }
    return map;
  }, [variables, requests]);

  function patchRow(index: number, patch: Partial<KeyValue>) {
    if (index === variables.length) {
      // editing the ghost row → materialize it
      onChange([...variables, { ...GHOST_ROW, ...patch }]);
      return;
    }
    onChange(variables.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(variables.filter((_, i) => i !== index));
  }

  async function copyToken(name: string) {
    if (name.trim() === "") return;
    await writeClipboard(`{{${name}}}`);
    setCopiedName(name);
    window.setTimeout(() => setCopiedName((c) => (c === name ? null : c)), 1200);
  }

  if (variables.length === 0) {
    return (
      <EmptyState
        compact
        headline={t("env.noVariablesHeadline")}
        hint={t("env.noVariablesHint")}
        actionLabel={t("env.addVariable")}
        onAction={() => onChange([{ ...GHOST_ROW }])}
        icon={<Icon name="i-braces" size={18} />}
      />
    );
  }

  return (
    <div className="env-vars">
      <div className="env-vars-search">
        <span aria-hidden className="env-vars-search-icon">
          <Icon name="i-search" size={13} />
        </span>
        <input
          type="search"
          value={query}
          placeholder={t("env.searchVariables")}
          aria-label={t("env.searchVariablesAria")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {filtering && (
          <span className="env-vars-count">
            {t("env.filterCount", { shown: visible.length, total: variables.length })}
          </span>
        )}
      </div>

      <div className="kv-grid">
        {filtering && visible.length === 0 ? (
          <p className="env-vars-noresults">{t("common.noResults")}</p>
        ) : (
          visible.map(({ variable, index, ghost }) => {
            const usage = usageByName.get(variable.name) ?? 0;
            return (
              <div className={`kv-row${ghost ? " ghost" : ""}`} key={index}>
                <input
                  type="checkbox"
                  className="kv-check"
                  checked={variable.enabled}
                  disabled={ghost}
                  aria-label={t("workbench.enable", {
                    label: variable.name || t("env.variableNamePlaceholder"),
                  })}
                  onChange={(event) => patchRow(index, { enabled: event.target.checked })}
                />
                <input
                  type="text"
                  className="kv-input kv-key"
                  value={variable.name}
                  placeholder={t("env.variableNamePlaceholder")}
                  aria-label={t("env.variableHeader")}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => patchRow(index, { name: event.target.value })}
                />
                <input
                  type="text"
                  className="kv-input kv-value"
                  value={variable.value}
                  placeholder={t("env.valuePlaceholder")}
                  aria-label={t("env.valueHeader")}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => patchRow(index, { value: event.target.value })}
                />
                <span className="kv-actions">
                  {usage > 0 && (
                    <span
                      className="kv-usage"
                      title={t("env.usageTitle", { count: usage })}
                    >
                      {t("env.usageCount", { count: usage })}
                    </span>
                  )}
                  {!ghost && (
                    <>
                      <button
                        type="button"
                        className="kv-iconbtn"
                        aria-label={t("env.copyToken", { name: variable.name })}
                        title={copiedName === variable.name ? t("env.copied") : `{{${variable.name}}}`}
                        disabled={variable.name.trim() === ""}
                        onClick={() => void copyToken(variable.name)}
                      >
                        <Icon name={copiedName === variable.name ? "i-check" : "i-copy"} size={13} />
                      </button>
                      <button
                        type="button"
                        className="kv-iconbtn danger"
                        aria-label={t("workbench.remove", {
                          label: variable.name || t("env.variableNamePlaceholder"),
                        })}
                        onClick={() => removeRow(index)}
                      >
                        <Icon name="i-x" size={13} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
