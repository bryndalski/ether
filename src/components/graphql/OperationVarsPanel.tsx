import { useState } from "react";
import type { KeyValue } from "../../lib/types";
import { VariablesPanel } from "./VariablesPanel";
import { HeadersPanel } from "./HeadersPanel";

interface OperationVarsPanelProps {
  variablesJson: string;
  onVariablesChange: (text: string) => void;
  headers: KeyValue[];
  onHeadersChange: (headers: KeyValue[]) => void;
}

type VarsTab = "Variables" | "Headers";

/** The `.vars-pane` under the editor: a Variables | Headers tab strip. A real
 *  role="tablist" with arrow-key navigation and aria-selected. */
export function OperationVarsPanel({
  variablesJson,
  onVariablesChange,
  headers,
  onHeadersChange,
}: OperationVarsPanelProps) {
  const [tab, setTab] = useState<VarsTab>("Variables");
  const headerCount = headers.filter((h) => h.enabled && h.name !== "").length;

  const tabs: VarsTab[] = ["Variables", "Headers"];

  return (
    <div className="vars-pane">
      <div className="vars-tabs" role="tablist" aria-label="Zmienne i nagłówki">
        {tabs.map((key, index) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`t${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const dir = event.key === "ArrowRight" ? 1 : -1;
                setTab(tabs[(index + dir + tabs.length) % tabs.length]);
              }
            }}
          >
            {key}
            {key === "Headers" && headerCount > 0 ? ` ${headerCount}` : ""}
          </button>
        ))}
      </div>
      {tab === "Variables" ? (
        <VariablesPanel value={variablesJson} onChange={onVariablesChange} />
      ) : (
        <HeadersPanel headers={headers} onChange={onHeadersChange} />
      )}
    </div>
  );
}
