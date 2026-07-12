// Replay is redaction-aware: history stores the resolved-then-redacted request,
// so any secret-bearing value was replaced with the REDACTED sentinel (•••)
// engine-side (store.rs::redact_request) BEFORE hitting SQLite. The frontend
// must NEVER transmit that sentinel as a real credential — these pure helpers
// detect the holes and gate the Send button. See docs/architecture/history-diff.md §4.

import type { Auth, KeyValue, RequestSpec, StoredRequest } from "./types";

/** The exact sentinel Rust writes for a redacted secret (three U+2022 BULLET).
 *  Shared const so FE and the Rust `REDACTED` stay in lockstep. */
export const REDACTED = "•••";

export type RedactionHoleKind =
  | "auth-bearer"
  | "auth-basic"
  | "auth-api-key"
  | "header"
  | "query";

export interface RedactionHole {
  kind: RedactionHoleKind;
  /** Human/aria label of the field, e.g. "Authorization" or "X-Api-Key". */
  name: string;
}

function isRedacted(value: string | undefined): boolean {
  return value === REDACTED;
}

/** Scan the auth block for a redacted secret hole. Body is never redacted;
 *  sig_v4 carries no secret in the spec, so it never produces a hole. */
function authHole(auth: Auth): RedactionHole | null {
  if (auth.type === "bearer" && isRedacted(auth.token)) {
    return { kind: "auth-bearer", name: "Authorization (Bearer)" };
  }
  if (auth.type === "basic" && isRedacted(auth.password)) {
    return { kind: "auth-basic", name: "Basic password" };
  }
  if (auth.type === "api_key" && isRedacted(auth.value)) {
    return { kind: "auth-api-key", name: auth.name || "API key" };
  }
  return null;
}

function kvHoles(
  rows: KeyValue[],
  kind: "header" | "query",
): RedactionHole[] {
  return rows
    .filter((row) => isRedacted(row.value))
    .map((row) => ({ kind, name: row.name }));
}

/** Every redacted secret field in a (history) request spec. The list drives the
 *  reconcile banner and the per-field highlight in Replay. */
export function redactedFields(spec: RequestSpec): RedactionHole[] {
  const holes: RedactionHole[] = [];
  const auth = authHole(spec.auth);
  if (auth) holes.push(auth);
  holes.push(...kvHoles(spec.headers, "header"));
  holes.push(...kvHoles(spec.query_params, "query"));
  return holes;
}

/** Hard Send-guard: true while any redacted sentinel remains in a secret field.
 *  When true, the Send button MUST block — a ••• is never sent as a credential. */
export function hasRedactedSecrets(spec: Pick<RequestSpec, "auth" | "headers" | "query_params">): boolean {
  if (authHole(spec.auth)) return true;
  if (spec.headers.some((row) => isRedacted(row.value))) return true;
  if (spec.query_params.some((row) => isRedacted(row.value))) return true;
  return false;
}

/** Map a history `RequestSpec` onto the current draft, keeping the draft's own
 *  identity fields (id/collection_id/name/sort_order/docs_md/graphql). This is
 *  the exact projection the `importSpec` draft action applies — kept here as a
 *  pure, unit-testable function so the mapping is verifiable in isolation. */
export function importSpecOntoDraft(
  draft: StoredRequest,
  spec: RequestSpec,
): StoredRequest {
  return {
    ...draft,
    method: spec.method,
    url: spec.url,
    headers: spec.headers,
    query_params: spec.query_params,
    body: spec.body,
    auth: spec.auth,
    options: spec.options,
  };
}
