import { useMemo, useState } from "react";
import type { ImportApi } from "../../hooks/useImport";
import {
  IMPORT_FORMAT_LABELS,
  type ImportFormat,
} from "../../lib/importFormat";
import { ImportResultPreview } from "./ImportResultPreview";
import { useT } from "../../i18n/useT";

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
  const t = useT();
  const [text, setText] = useState("");
  const [override, setOverride] = useState<ImportFormat | "auto">("auto");
  const [includeEnvs, setIncludeEnvs] = useState(false);

  const detected = useMemo(() => api.detect(text), [api, text]);
  const format = override === "auto" ? detected : override;
  const stage = api.stage;
  const formatLabel = (fmt: ImportFormat): string =>
    fmt === "unknown" ? t("import.unknownFormat") : IMPORT_FORMAT_LABELS[fmt];

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
    <div className="import-modal-body" role="tabpanel" aria-label={t("import.importFileTab")}>
      <label className="import-label" htmlFor="import-file-text">
        {t("import.pasteFileContents")}
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
          {t("import.detected", { format: formatLabel(detected) })}
        </span>
        <label className="import-label" htmlFor="import-format-override">
          {t("import.forceFormat")}
        </label>
        <select
          id="import-format-override"
          className="import-select"
          value={override}
          onChange={(event) =>
            setOverride(event.target.value as ImportFormat | "auto")
          }
        >
          <option value="auto">{t("import.auto")}</option>
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
          {t("import.importAction")}
        </button>
      </div>

      {format === "unknown" && text.trim() !== "" && (
        <p className="import-error" aria-live="polite">
          {t("import.unrecognizedFormat")}
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
              {t("import.alsoImportEnvironments", {
                count: stage.result.environments.length,
              })}
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
            {t("import.saveToCollection")}
          </button>
        </>
      )}
    </div>
  );
}
