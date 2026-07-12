import { useCallback, useState } from "react";
import {
  fromCurl,
  importHar,
  importHttpFile,
  importInsomnia,
  importPostman,
  scanShellHistoryCurls,
  upsertCollection,
  upsertEnvironment,
  upsertRequest,
} from "../lib/ipc";
import { detectImportFormat, type ImportFormat } from "../lib/importFormat";
import type { ImportResult, RequestSpec } from "../lib/types";

export type ImportStage =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "result"; result: ImportResult }
  | { kind: "error"; message: string };

const IMPORTER_BY_FORMAT: Record<
  Exclude<ImportFormat, "unknown">,
  (text: string) => Promise<ImportResult>
> = {
  postman: importPostman,
  insomnia: importInsomnia,
  har: importHar,
  http: importHttpFile,
};

export interface ImportApi {
  stage: ImportStage;
  reset: () => void;
  detect: (text: string) => ImportFormat;
  importFile: (text: string, format: ImportFormat) => Promise<void>;
  parseCurl: (command: string) => Promise<RequestSpec | null>;
  scanHistory: (limit?: number | null) => Promise<string[]>;
  persist: (result: ImportResult, includeEnvironments: boolean) => Promise<void>;
}

const DEFAULT_SCAN_LIMIT = 200;

/** Import state machine: detect format → dispatch the matching import_* IPC →
 *  preview ImportResult → persist (collections before requests). Paste-cURL and
 *  scan-history load a single RequestSpec into the draft (no ImportResult). */
export function useImport(): ImportApi {
  const [stage, setStage] = useState<ImportStage>({ kind: "idle" });

  const reset = useCallback(() => setStage({ kind: "idle" }), []);

  const detect = useCallback(
    (text: string): ImportFormat => detectImportFormat(text),
    [],
  );

  const importFile = useCallback(
    async (text: string, format: ImportFormat) => {
      if (format === "unknown") {
        setStage({
          kind: "error",
          message: "Nie rozpoznano formatu pliku.",
        });
        return;
      }
      setStage({ kind: "running" });
      try {
        const result = await IMPORTER_BY_FORMAT[format](text);
        setStage({ kind: "result", result });
      } catch (error) {
        setStage({ kind: "error", message: String(error) });
      }
    },
    [],
  );

  const parseCurl = useCallback(
    async (command: string): Promise<RequestSpec | null> => {
      try {
        return await fromCurl(command);
      } catch (error) {
        setStage({ kind: "error", message: String(error) });
        return null;
      }
    },
    [],
  );

  const scanHistory = useCallback(
    async (limit: number | null = DEFAULT_SCAN_LIMIT): Promise<string[]> => {
      try {
        return await scanShellHistoryCurls(limit);
      } catch (error) {
        setStage({ kind: "error", message: String(error) });
        return [];
      }
    },
    [],
  );

  const persist = useCallback(
    async (result: ImportResult, includeEnvironments: boolean) => {
      setStage({ kind: "running" });
      try {
        // Collections before requests: a request references its collection_id.
        for (const collection of result.collections) {
          await upsertCollection(collection);
        }
        for (const request of result.requests) {
          await upsertRequest(request);
        }
        if (includeEnvironments) {
          for (const environment of result.environments) {
            await upsertEnvironment(environment);
          }
        }
      } catch (error) {
        // Keep the preview so the user can retry — do not claim success.
        setStage({ kind: "result", result });
        throw error;
      }
    },
    [],
  );

  return { stage, reset, detect, importFile, parseCurl, scanHistory, persist };
}
