import type { KeyValue } from "../../lib/types";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface WorkflowHeadersTableProps {
  headers: KeyValue[];
  onChange: (headers: KeyValue[]) => void;
}

const GHOST_ROW: KeyValue = { name: "", value: "", enabled: true };

/** Headers key-value editor for a workflow request node, using the shared
 *  Postman-style kv-grid (see common/kv-grid.css): dense rows, identical
 *  monospace key/value inputs, delete-on-hover, and a trailing ghost row that
 *  materializes on first edit. */
export function WorkflowHeadersTable({ headers, onChange }: WorkflowHeadersTableProps) {
  const t = useT();
  const rows = [...headers, GHOST_ROW];

  function patchRow(index: number, patch: Partial<KeyValue>) {
    if (index === headers.length) {
      onChange([...headers, { ...GHOST_ROW, ...patch }]);
      return;
    }
    onChange(headers.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(headers.filter((_, i) => i !== index));
  }

  return (
    <div className="kv-grid">
      {rows.map((row, index) => {
        const ghost = index === headers.length;
        const label = row.name || t("env.variableNamePlaceholder");
        return (
          <div className={`kv-row${ghost ? " ghost" : ""}`} key={index}>
            <input
              type="checkbox"
              className="kv-check"
              checked={row.enabled}
              disabled={ghost}
              aria-label={t("workbench.enable", { label })}
              onChange={(event) => patchRow(index, { enabled: event.target.checked })}
            />
            <input
              type="text"
              className="kv-input kv-key"
              value={row.name}
              placeholder={t("workflow.headerName")}
              aria-label={t("workflow.headerName")}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => patchRow(index, { name: event.target.value })}
            />
            <input
              type="text"
              className="kv-input kv-value"
              value={row.value}
              placeholder={t("workflow.headerValue")}
              aria-label={t("workflow.headerValue")}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => patchRow(index, { value: event.target.value })}
            />
            <span className="kv-actions">
              {!ghost && (
                <button
                  type="button"
                  className="kv-iconbtn danger"
                  aria-label={t("workbench.remove", { label })}
                  onClick={() => removeRow(index)}
                >
                  <Icon name="i-x" size={13} />
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
