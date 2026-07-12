import { useCallback } from "react";
import { resolvePreviewCurl } from "../lib/ipc";
import { writeClipboard } from "../lib/clipboard";
import { useToast } from "../state/useToast";
import type { StoredRequest } from "../lib/types";

/** Copy the request as a REDACTED cURL. Only resolve_preview_curl is used —
 *  Rust replaces secrets with "•••" before the string ever reaches the FE.
 *  to_curl(spec, false) is forbidden in this feature. */
export function useCopyAsCurl(
  draft: StoredRequest,
  environmentId: string | null,
): () => Promise<void> {
  const show = useToast((state) => state.show);

  return useCallback(async () => {
    try {
      const curl = await resolvePreviewCurl(draft, environmentId);
      await writeClipboard(curl);
      show("Skopiowano cURL — sekrety zredagowane", "success");
    } catch {
      show("Nie udało się skopiować", "danger");
    }
  }, [draft, environmentId, show]);
}
