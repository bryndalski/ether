// Pure format detection for the Import "file" tab. Each branch keys off the
// format's own signature, so detection is deterministic and unit-testable. The
// user still sees the detected format as a chip and can override it.

export type ImportFormat =
  | "postman"
  | "insomnia"
  | "har"
  | "http"
  | "unknown";

const HTTP_VERB = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S/i;

function looksLikeHttpFile(text: string): boolean {
  const firstMeaningfulLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#") && !line.startsWith("//"));
  return firstMeaningfulLine != null && HTTP_VERB.test(firstMeaningfulLine);
}

function detectFromObject(obj: Record<string, unknown>): ImportFormat {
  const info = obj.info as Record<string, unknown> | undefined;
  if (
    (typeof info?.schema === "string" &&
      info.schema.includes("schema.getpostman.com")) ||
    (info != null && Array.isArray(obj.item))
  ) {
    return "postman";
  }

  const log = obj.log as Record<string, unknown> | undefined;
  if (log != null && Array.isArray(log.entries)) {
    return "har";
  }

  if (
    obj._type === "export" &&
    obj.__export_format != null &&
    Array.isArray(obj.resources)
  ) {
    return "insomnia";
  }

  return "unknown";
}

export function detectImportFormat(text: string): ImportFormat {
  const trimmed = text.trim();
  if (trimmed === "") return "unknown";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return looksLikeHttpFile(trimmed) ? "http" : "unknown";
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "unknown";
  }
  return detectFromObject(parsed as Record<string, unknown>);
}

// Proper nouns are locale-independent; the `unknown` fallback is localized at
// its call sites via i18n `import.unknownFormat` (see ImportFileTab).
export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  postman: "Postman",
  insomnia: "Insomnia",
  har: "HAR",
  http: ".http",
  unknown: "Unknown",
};
