// Debounced redacted-curl preview. Calls resolve_preview_curl (Rust redacts —
// the FE NEVER calls to_curl for previews). Re-runs on a debounced draft change
// while the caller keeps the tab open.

import { useEffect, useRef, useState } from "react";
import { resolvePreviewCurl } from "../lib/ipc";
import type { StoredRequest } from "../lib/types";

interface CurlPreviewState {
  preview: string;
  error: string | null;
  loading: boolean;
}

const DEBOUNCE_MS = 300;

export function useCurlPreview(
  draft: StoredRequest,
  environmentId: string | null,
  enabled: boolean,
): CurlPreviewState {
  const [state, setState] = useState<CurlPreviewState>({
    preview: "",
    error: null,
    loading: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((current) => ({ ...current, loading: true }));

    timerRef.current = setTimeout(() => {
      let canceled = false;
      resolvePreviewCurl(draft, environmentId)
        .then((preview) => {
          if (!canceled) setState({ preview, error: null, loading: false });
        })
        .catch((error) => {
          if (!canceled) {
            setState({ preview: "", error: String(error), loading: false });
          }
        });
      return () => {
        canceled = true;
      };
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, environmentId, JSON.stringify(draft)]);

  return state;
}
