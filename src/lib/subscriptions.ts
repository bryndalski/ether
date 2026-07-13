// The FE mirror of the Rust `SubEvent` contract (src-tauri/src/subscriptions.rs).
// One channel ("gql-sub"), one payload type discriminated by `kind`; the `id`
// routes each event to its owning stream so a single listener serves many
// concurrent subscriptions. Never invent a field the Rust side does not emit.

/** The Tauri event channel every subscription streams on. */
export const SUB_CHANNEL = "gql-sub";

/** How many events the stream buffer holds before dropping the oldest. Surfaced
 *  as a constant so the cap is one place, not a magic number in the hook. */
export const STREAM_BUFFER_CAP = 500;

export type SubEventKind = "next" | "error" | "complete" | "status";
export type ConnStatus = "connecting" | "open" | "error" | "closed";

/** The raw event as emitted by Rust on the "gql-sub" channel. */
export interface SubEvent {
  id: string;
  seq: number;
  kind: SubEventKind;
  ts: string; // ISO-8601 UTC, stamped by Rust
  data?: unknown; // next → { data, errors? } ; error → GraphQLError[]
  status?: ConnStatus; // only when kind === "status"
  message?: string; // error / failed status
}
