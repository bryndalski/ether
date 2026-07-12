// Redaction-aware Replay. Loads a history entry's structure into the draft, then:
//  - no redacted holes → may load-and-send immediately (fast path);
//  - holes present → loads only, surfaces the reconcile banner, and the Send
//    guard (hasRedactedSecrets) blocks transmission until the user re-supplies
//    {{secret.…}} templates. A ••• is NEVER sent as a real credential.

import { useCallback, useState } from "react";
import type { DraftAction } from "./useRequestDraft";
import { redactedFields, type RedactionHole } from "../lib/replay";
import type { HistoryEntry, StoredRequest } from "../lib/types";

interface UseHistoryReplay {
  holes: RedactionHole[];
  replay: (entry: HistoryEntry) => void;
  dismiss: () => void;
}

interface UseHistoryReplayArgs {
  dispatch: React.Dispatch<DraftAction>;
  /** Load-and-send an already-imported draft (fast path, holes === 0). */
  sendDraft: (draft: StoredRequest) => void;
  /** The current draft so the fast path can send the freshly-imported spec. */
  draft: StoredRequest;
}

export function useHistoryReplay({
  dispatch,
  sendDraft,
  draft,
}: UseHistoryReplayArgs): UseHistoryReplay {
  const [holes, setHoles] = useState<RedactionHole[]>([]);

  const replay = useCallback(
    (entry: HistoryEntry) => {
      const spec = entry.request;
      dispatch({ kind: "importSpec", spec });
      const detected = redactedFields(spec);
      setHoles(detected);
      if (detected.length === 0) {
        // Safe: nothing was redacted — send the imported structure right away.
        sendDraft({
          ...draft,
          method: spec.method,
          url: spec.url,
          headers: spec.headers,
          query_params: spec.query_params,
          body: spec.body,
          auth: spec.auth,
          options: spec.options,
        });
      }
    },
    [dispatch, sendDraft, draft],
  );

  const dismiss = useCallback(() => setHoles([]), []);

  return { holes, replay, dismiss };
}
