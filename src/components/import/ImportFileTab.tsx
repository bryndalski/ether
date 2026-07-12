import { useMemo, useState } from "react";
import type { ImportApi } from "../../hooks/useImport";
import {
  IMPORT_FORMAT_LABELS,
  type ImportFormat,
} from "../../lib/importFormat";
import { ImportResultPreview } from "./ImportResultPreview";

interface ImportFileTabProps {
  api: ImportApi;
  onSaved: (requestCount: number, collectionCount: number) => void;
  onError: (message: string) => void;
}

const OVERRIDE_OPTIONS: ImportFormat[] = [
  "postman",
  "insomnia",
  "har",
  "http",
];

/** Paste file contents → auto-detect format (chip + override) → matching
 *  import_* IPC → preview + warnings → save (collections before requests). */
export function ImportFileTab({ api, onSaved, onError }: ImportFileTabProps) {
  const [text, setText] = useState("");
  const [override, setOverride] = useState<ImportFormat | "auto">("auto");
  const [includeEnvs, setIncludeEnvs] = useState(false);

  const detected = useMemo(() => api.detect(text), [api, text]);
  const format = override === "auto" ? detected : override;
  const stage = api.stage;

  async function onSave() {
    if (stage.kind !== "result") return;
    try {
      await api.persist(stage.result, includeEnvs);
      onSaved(stage.result.requests.length, stage.result.collections.length);
    } catch (error) {
      onError(String(error));
    }
  }

  return (
    <div className="import-modal-body" role="tabpanel" aria-label="Importuj plik">
      <label className="import-label" htmlFor="import-file-text">
        Wklej zawartość pliku (Postman / Insomnia / HAR / .http)
      </label>
      <textarea
        id="import-file-text"
        className="import-textarea"
        value={text}
        spellCheck={false}
        placeholder='{"info": {"schema": "…getpostman.com…"}, "item": []}'
        onChange={(event) => setText(event.target.value)}
      />

      <div className="import-row">
        <span className="import-chip" aria-live="polite">
          Wykryto: {IMPORT_FORMAT_LABELS[detected]}
        </span>
        <label className="import-label" htmlFor="import-format-override">
          Wymuś format
        </label>
        <select
          id="import-format-override"
          className="import-select"
          value={override}
          onChange={(event) =>
            setOverride(event.target.value as ImportFormat | "auto")
          }
        >
          <option value="auto">Auto</option>
          {OVERRIDE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {IMPORT_FORMAT_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="import-btn"
          disabled={text.trim() === "" || format === "unknown"}
          onClick={() => void api.importFile(text, format)}
        >
          Importuj
        </button>
      </div>

      {format === "unknown" && text.trim() !== "" && (
        <p className="import-error" aria-live="polite">
          Nie rozpoznano formatu — wybierz format ręcznie.
        </p>
      )}
      {stage.kind === "error" && (
        <p className="import-error" aria-live="polite">
          {stage.message}
        </p>
      )}

      {stage.kind === "result" && (
        <>
          <ImportResultPreview result={stage.result} />
          {stage.result.environments.length > 0 && (
            <label className="import-checkbox">
              <input
                type="checkbox"
                checked={includeEnvs}
                onChange={(event) => setIncludeEnvs(event.target.checked)}
              />
              Zaimportuj też {stage.result.environments.length} środowisk
            </label>
          )}
          <button
            type="button"
            className="import-btn"
            disabled={
              stage.result.collections.length === 0 &&
              stage.result.requests.length === 0
            }
            onClick={() => void onSave()}
          >
            Zapisz do kolekcji
          </button>
        </>
      )}
    </div>
  );
}
