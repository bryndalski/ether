import { useMemo } from "react";
import type { KeyValue } from "../../lib/types";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";
import { useVariableCandidates } from "../../hooks/useVariableCandidates";
import {
  COMMON_HEADER_NAMES,
  contentTypeValueCompletionSource,
} from "../../lib/completion/headerCatalog";
import { KeyValueValueCell } from "./KeyValueValueCell";

interface KeyValueTableProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyHeader?: string;
  valueHeader?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  keyClassName?: string;
  /** "headers" adds a header-name <datalist> + Content-Type value list. */
  variant?: "params" | "headers";
}

const EMPTY: KeyValue = { name: "", value: "", enabled: true };
const HEADER_NAME_LIST_ID = "lok-header-names";

/** The enable/disable KV grid shared by Params, Headers and form body. A
 *  trailing "ghost" row appends a new entry on first edit; ✕ removes a row.
 *  Value cells carry the shared `{{...}}` autocomplete (lazy on focus). */
export function KeyValueTable({
  rows,
  onChange,
  keyHeader = "Key",
  valueHeader = "Value",
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  keyClassName = "k",
  variant = "params",
}: KeyValueTableProps) {
  const t = useT();
  const getCandidates = useVariableCandidates();
  const isHeaders = variant === "headers";
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
      {isHeaders && (
        <datalist id={HEADER_NAME_LIST_ID}>
          {COMMON_HEADER_NAMES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
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
              list={isHeaders ? HEADER_NAME_LIST_ID : undefined}
              onChange={(event) => patchRow(index, { name: event.target.value })}
            />
            <ValueCell
              rowName={row.name}
              value={row.value}
              placeholder={valuePlaceholder}
              ariaLabel={`${valueHeader} ${index + 1}`}
              isHeaders={isHeaders}
              getCandidates={getCandidates}
              onChange={(next) => patchRow(index, { value: next })}
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

interface ValueCellProps {
  rowName: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  isHeaders: boolean;
  getCandidates: ReturnType<typeof useVariableCandidates>;
  onChange: (value: string) => void;
}

/** Wraps KeyValueValueCell and, for a Content-Type header row, adds the MIME
 *  value list as an extra completion source alongside `{{...}}`. */
function ValueCell({
  rowName,
  value,
  placeholder,
  ariaLabel,
  isHeaders,
  getCandidates,
  onChange,
}: ValueCellProps) {
  const extraSources = useMemo(
    () =>
      isHeaders ? [contentTypeValueCompletionSource(() => rowName)] : undefined,
    [isHeaders, rowName],
  );
  return (
    <KeyValueValueCell
      value={value}
      onChange={onChange}
      getCandidates={getCandidates}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      extraSources={extraSources}
    />
  );
}
