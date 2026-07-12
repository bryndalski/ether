import { useState } from "react";
import type { RequestSpec, StoredRequest } from "../../lib/types";
import { fromCurl } from "../../lib/ipc";
import { useCurlPreview } from "../../hooks/useCurlPreview";
import { Icon } from "../common/Icon";
import { CurlLog } from "./CurlLog";

interface CurlTabProps {
  draft: StoredRequest;
  environmentId: string | null;
  onImport: (spec: RequestSpec) => void;
}

/** Two-way cURL surface: view = redacted resolve_preview_curl; import =
 *  from_curl → RequestSpec merged onto the draft. Never calls to_curl. */
export function CurlTab({ draft, environmentId, onImport }: CurlTabProps) {
  const preview = useCurlPreview(draft, environmentId, true);
  const [pasted, setPasted] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  async function runImport() {
    setImportError(null);
    try {
      const spec = await fromCurl(pasted);
      onImport(spec);
    } catch (error) {
      setImportError(String(error));
    }
  }

  function copyPreview() {
    void navigator.clipboard?.writeText(preview.preview);
  }

  return (
    <div className="pane" role="tabpanel" aria-label="cURL">
      <div className="pane-inner" style={{ display: "grid", gap: 16 }}>
        <div>
          <div
            className="wb-label"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            cURL · secrets redacted
            <button
              type="button"
              aria-label="Kopiuj cURL"
              onClick={copyPreview}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "var(--lok-text-tertiary)",
                cursor: "pointer",
              }}
            >
              <Icon name="i-copy" size={13} />
            </button>
          </div>
          {preview.error ? (
            <p
              className="wb-label"
              aria-live="polite"
              style={{ color: "var(--lok-status-danger)" }}
            >
              {preview.error}
            </p>
          ) : (
            <CurlLog
              text={preview.preview || "…"}
              style={{ marginTop: "var(--lok-space-2)" }}
            />
          )}
        </div>

        <div>
          <label className="wb-label" htmlFor="curl-import">
            Importuj z cURL
          </label>
          <textarea
            id="curl-import"
            value={pasted}
            placeholder="curl https://api.example.com/users -H 'Authorization: Bearer …'"
            spellCheck={false}
            onChange={(event) => setPasted(event.target.value)}
            style={{
              width: "100%",
              minHeight: 80,
              marginTop: "var(--lok-space-2)",
              padding: "var(--lok-space-2)",
              borderRadius: "var(--lok-radius-sm)",
              background: "var(--lok-bg-input)",
              border: "1px solid var(--lok-border-default)",
              color: "var(--lok-text-primary)",
              fontFamily: "var(--lok-font-mono)",
              fontSize: "var(--lok-fs-xs)",
            }}
          />
          <button
            type="button"
            className="btn-send"
            style={{ marginTop: "var(--lok-space-2)" }}
            disabled={pasted.trim() === ""}
            onClick={runImport}
          >
            Import
          </button>
          {importError && (
            <p
              className="wb-label"
              aria-live="polite"
              style={{
                color: "var(--lok-status-danger)",
                marginTop: "var(--lok-space-2)",
              }}
            >
              {importError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
