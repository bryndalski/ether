// TypeScript mirror of the AI contract in src-tauri/src/ai.rs. Field names must
// stay 1:1 with the Rust structs — the Tauri IPC boundary serializes by these
// exact names. The AI never defines the schema: outputs are validated INTO the
// existing model types (see validate.ts). See docs/architecture/local-ai.md §1.2.

/** The five ⌘K actions; drives the system prompt + validation shape. Mirrors
 *  Rust `AiActionKind` (serde `rename_all = "kebab-case"`). */
export type AiActionKind =
  | "explain-error"
  | "generate-assertions"
  | "nl-to-request"
  | "nl-to-graphql"
  | "document-request";

/** One chat message. Only `system` / `user` roles are ever sent (no assistant
 *  history — v1 is one-shot, not a conversation). */
export interface AiMessage {
  role: "system" | "user";
  content: string;
}

/** An installed Ollama model, as surfaced by /api/tags. */
export interface AiModelInfo {
  name: string;
  size_bytes: number;
  family: string | null;
  param_size: string | null;
}

/** Liveness + installed-models probe. `endpoint` is ALWAYS the loopback host —
 *  it backs the "100% local" badge, so the UI can never claim locality the
 *  client isn't honoring. */
export interface AiHealth {
  running: boolean;
  models: AiModelInfo[];
  endpoint: string;
  host_ram_bytes: number | null;
}

/** The `ai_chat` request. Messages are ALREADY redacted by the caller and
 *  re-redacted authoritatively in Rust before any socket opens. */
export interface AiChatRequest {
  model: string;
  messages: AiMessage[];
  schema: unknown;
  action: AiActionKind;
}

/** The model's structured (schema-constrained) output plus local timing. */
export interface AiChatResult {
  raw_json: unknown;
  model: string;
  eval_ms: number;
}
