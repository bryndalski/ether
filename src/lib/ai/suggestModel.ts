// Pure RAM → model-suggestion bucketizer. The suggestion is only a HINT baked
// into the onboarding copy-command; Ether never auto-pulls. The table is data
// (easy to revise); the helper just bucketizes. See docs/architecture/local-ai.md §1.4.

/** i18n key for the note shown beside a suggested model. */
export type ModelNoteKey =
  | "ai.suggestSmallFast"
  | "ai.suggestBalanced"
  | "ai.suggestStrongCode";

export interface ModelSuggestion {
  name: string;
  noteKey: ModelNoteKey;
}

const GB = 1024 * 1024 * 1024;

/** Bucket host RAM (bytes) → a sane default pull. Boundaries: < 8 GB, 8–16 GB,
 *  ≥ 16 GB. `null`/unknown RAM defaults to the balanced 8b model. */
export function suggestModel(totalRamBytes: number | null): ModelSuggestion {
  if (totalRamBytes === null || Number.isNaN(totalRamBytes)) {
    return { name: "llama3.1:8b", noteKey: "ai.suggestBalanced" };
  }
  if (totalRamBytes < 8 * GB) {
    return { name: "llama3.2:3b", noteKey: "ai.suggestSmallFast" };
  }
  if (totalRamBytes < 16 * GB) {
    return { name: "llama3.1:8b", noteKey: "ai.suggestBalanced" };
  }
  return { name: "qwen2.5-coder:7b", noteKey: "ai.suggestStrongCode" };
}
