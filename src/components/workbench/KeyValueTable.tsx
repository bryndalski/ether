import type { KeyValue } from "../../lib/types";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface KeyValueTableProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyHeader?: string;
  valueHeader?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  keyClassName?: string;
}

const EMPTY: KeyValue = { name: "", value: "", enabled: true };

/** The enable/disable KV grid shared by Params, Headers and form body. A
 *  trailing "ghost" row appends a new entry on first edit; ✕ removes a row.
 *  Fully controlled — the row list is driven by useRequestDraft, not local state. */
export function KeyValueTable({
  rows,
  onChange,
  keyHeader = "Key",
  valueHeader = "Value",
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  keyClassName = "k",
}: KeyValueTableProps) {
  const t = useT();
  // Render the real rows plus one ghost row for adding the next entry.
  const displayRows = [...rows, EMPTY];

  function patchRow(index: number, patch: Partial<KeyValue>) {
    if (index === rows.length) {
      // editing the ghost row → materialize it
      onChange([...rows, { ...EMPTY, ...patch }]);
      return;
    }
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="kv-head">
        <span />
        <span>{keyHeader}</span>
        <span>{valueHeader}</span>
        <span />
      </div>
      {displayRows.map((row, index) => {
        const isGhost = index === rows.length;
        const label = row.name || (isGhost ? t("sidebar.newEntry") : keyPlaceholder);
        return (
          <div className="kv" key={index}>
            <input
              type="checkbox"
              checked={row.enabled}
              aria-label={t("workbench.enable", { label })}
              onChange={(event) =>
                patchRow(index, { enabled: event.target.checked })
              }
            />
            <input
              type="text"
              className={keyClassName}
              value={row.name}
              placeholder={keyPlaceholder}
              aria-label={`${keyHeader} ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => patchRow(index, { name: event.target.value })}
            />
            <input
              type="text"
              value={row.value}
              placeholder={valuePlaceholder}
              aria-label={`${valueHeader} ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => patchRow(index, { value: event.target.value })}
            />
            {isGhost ? (
              <span />
            ) : (
              <button
                type="button"
                className="rm"
                aria-label={t("workbench.remove", { label })}
                onClick={() => removeRow(index)}
              >
                <Icon name="i-x" size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
