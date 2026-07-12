import { useState } from "react";
import type { ImportApi } from "../../hooks/useImport";
import type { RequestSpec } from "../../lib/types";

interface PasteCurlTabProps {
  api: ImportApi;
  activeRequestPresent: boolean;
  onLoadSpec: (spec: RequestSpec, mode: "current" | "new") => void;
}

/** Paste a cURL command → from_curl → RequestSpec loaded into a draft. Mirrors
 *  CurlTab's import interaction; never produces an ImportResult. */
export function PasteCurlTab({
  api,
  activeRequestPresent,
  onLoadSpec,
}: PasteCurlTabProps) {
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "current" | "new") {
    setError(null);
    const spec = await api.parseCurl(command);
    if (!spec) {
      setError("Nie udało się sparsować cURL.");
      return;
    }
    onLoadSpec(spec, mode);
  }

  return (
    <div className="import-modal-body" role="tabpanel" aria-label="Wklej cURL">
      <label className="import-label" htmlFor="import-paste-curl">
        Wklej polecenie cURL
      </label>
      <textarea
        id="import-paste-curl"
        className="import-textarea"
        value={command}
        spellCheck={false}
        placeholder="curl https://api.example.com/users -H 'Authorization: Bearer …'"
        onChange={(event) => setCommand(event.target.value)}
      />
      <div className="import-placement">
        <button
          type="button"
          className="import-btn"
          disabled={command.trim() === ""}
          onClick={() => void run(activeRequestPresent ? "current" : "new")}
        >
          {activeRequestPresent ? "Wczytaj do requestu" : "Nowy request z cURL"}
        </button>
        {activeRequestPresent && (
          <button
            type="button"
            className="import-btn ghost"
            disabled={command.trim() === ""}
            onClick={() => void run("new")}
          >
            Nowy request z cURL
          </button>
        )}
      </div>
      {error && (
        <p className="import-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
