import { CurlLog } from "../workbench/CurlLog";

interface VerboseLogProps {
  verboseLog: string;
}

/** Render ResponseData.verbose_log verbatim (already redacted by Rust) with the
 *  request/response/info/redact coloring shared with the cURL preview. */
export function VerboseLog({ verboseLog }: VerboseLogProps) {
  if (verboseLog.trim() === "") {
    return <p className="wb-label">Brak logu transferu.</p>;
  }
  return <CurlLog text={verboseLog} />;
}
