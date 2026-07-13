// Orchestration for the five ⌘K AI actions: gather context → redact (FE mirror)
// → invoke ai_chat with the action's schema → validate into the model types →
// materialize the artifact via the SAME store paths the mouse UI uses. Never a
// chat panel. Logic lives here; the palette view stays dumb. All I/O is guarded
// so it is a no-op unless AI is opted-in + a model chosen (belt with the palette
// guard). See docs/architecture/local-ai.md §2 & step 6.

import { useCallback } from "react";
import { useUiStore } from "../state/useUiStore";
import { useCollectionsStore } from "../state/useCollectionsStore";
import { useToast } from "../state/useToast";
import { useT } from "../i18n/useT";
import { aiChat } from "../lib/ipc";
import type { AiActionKind } from "../lib/ai/types";
import { schemaFor } from "../lib/ai/schemas";
import { redactForModel } from "../lib/ai/redact";
import { buildExplainErrorMessages } from "../lib/ai/prompts";
import { validateArtifact } from "../lib/ai/validate";
import { applyArtifact } from "../lib/ai/materialize";

export interface AiActionCallbacks {
  aiExplainError: () => void;
  aiGenerateAssertions: () => void;
  aiNlToRequest: () => void;
  aiNlToGraphql: () => void;
  aiDocumentRequest: () => void;
}

/** One place that runs an action end-to-end. Returns a stable callback per
 *  action id. A failed chat / off-shape output surfaces a toast and creates NO
 *  artifact (the guarantee the tests pin). */
export function useAiAction(): AiActionCallbacks {
  const t = useT();
  const show = useToast((state) => state.show);

  const run = useCallback(
    async (action: AiActionKind, promptText: string, responseBody: string) => {
      const { aiEnabled, aiModel } = useUiStore.getState();
      if (!aiEnabled || aiModel === null) return; // guard — never invoke when off

      const messages = redactForModel(
        action === "explain-error"
          ? buildExplainErrorMessages(promptText, responseBody)
          : [{ role: "user", content: promptText }],
      );

      try {
        const result = await aiChat({ model: aiModel, messages, schema: schemaFor(action), action });
        const artifact = validateArtifact(action, result.raw_json);
        if (!artifact.ok) {
          show(t("ai.toastUnparseable"), "warn");
          return;
        }
        applyArtifact(artifact, {
          collections: useCollectionsStore.getState(),
          show,
          translate: t,
          evalMs: result.eval_ms,
        });
      } catch {
        show(t("ai.toastFailed"), "danger");
      }
    },
    [show, t],
  );

  const activeRequestId = useCollectionsStore((state) => state.activeRequestId);
  const activeRequest = useCollectionsStore((state) =>
    state.requests.find((request) => request.id === state.activeRequestId),
  );

  return {
    aiExplainError: () =>
      void run("explain-error", `Explain the last error for request ${activeRequestId ?? "?"}.`, ""),
    aiGenerateAssertions: () =>
      void run("generate-assertions", "Generate assertions for the last response.", ""),
    aiNlToRequest: () =>
      void run("nl-to-request", activeRequest?.name ?? "Describe the request to build.", ""),
    aiNlToGraphql: () =>
      void run("nl-to-graphql", "Build a GraphQL query.", ""),
    aiDocumentRequest: () =>
      void run("document-request", `Document request ${activeRequest?.name ?? "?"}.`, ""),
  };
}
