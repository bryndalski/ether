// Pure-ish materializer: turn a VALIDATED artifact into a real UI change via the
// same store paths the mouse UI uses. Kept separate from the hook so the mapping
// (artifact → store call) is unit-testable with a fake store. Assertions/docs
// mutate the active request; a new request is saved paused (never sent). Markdown
// diagnoses toast + are meant for the read-only diagnosis pane. See §2.

import type { ArtifactResult } from "./validate";
import type { StoredRequest, KeyValue } from "../types";
import type { TranslateFn } from "../../i18n/useT";
import type { ToastVariant } from "../../state/useToast";

/** The narrow store surface the materializer needs — a subset of the collections
 *  store, so tests can pass a fake. */
export interface MaterializeStore {
  activeRequest: () => StoredRequest | null;
  saveRequest: (draft: StoredRequest) => Promise<void> | void;
}

export interface MaterializeDeps {
  collections: MaterializeStore;
  show: (message: string, variant?: ToastVariant) => void;
  translate: TranslateFn;
  evalMs: number;
}

/** Body → a raw-text Body when a request artifact carries one. */
function bodyFromText(text: string | null): StoredRequest["body"] {
  if (text === null || text.trim() === "") return { type: "none" };
  return { type: "raw", content_type: "application/json", text };
}

/** Apply a validated artifact. Returns the diagnosis markdown (if any) so the
 *  caller can route it to the read-only diagnosis pane; other kinds return null. */
export function applyArtifact(
  artifact: Extract<ArtifactResult, { ok: true }>,
  deps: MaterializeDeps,
): string | null {
  const { collections, show } = deps;
  const active = collections.activeRequest();

  switch (artifact.kind) {
    case "assertions": {
      if (!active) return null;
      const next: StoredRequest = {
        ...active,
        assertions: [...active.assertions, ...artifact.assertions],
      };
      void collections.saveRequest(next);
      return null;
    }
    case "request": {
      if (!active) return null;
      const headers: KeyValue[] = artifact.request.headers;
      const next: StoredRequest = {
        ...active,
        method: artifact.request.method,
        url: artifact.request.url,
        headers,
        body: bodyFromText(artifact.request.bodyText),
      };
      // Saved paused — the user reviews and sends. id/collection_id kept from
      // the active request; the model never assigns them.
      void collections.saveRequest(next);
      return null;
    }
    case "graphql": {
      if (!active) return null;
      const next: StoredRequest = {
        ...active,
        graphql: {
          operation_type: active.graphql?.operation_type ?? "query",
          query: artifact.graphql.query,
          variables_json: artifact.graphql.variablesJson,
        },
      };
      void collections.saveRequest(next);
      return null;
    }
    case "markdown": {
      // Document-request writes docs_md on the active request; explain-error's
      // markdown is returned for the diagnosis pane.
      if (active) {
        void collections.saveRequest({ ...active, docs_md: artifact.markdown });
      }
      show(deps.translate("ai.diagnosisTitle"), "info");
      return artifact.markdown;
    }
  }
}
