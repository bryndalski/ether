// Typed wrappers over every Tauri command registered in src-tauri/src/lib.rs.
// Argument object keys must match each command's Rust parameter names exactly,
// since Tauri deserializes invoke args by name. Return types mirror models.rs.

import { invoke } from "@tauri-apps/api/core";
import type {
  Collection,
  Environment,
  HistoryEntry,
  ImportResult,
  RequestSpec,
  ResponseData,
  SnapshotRecord,
  StoredRequest,
} from "./types";
import type { Workflow } from "./workflow";
import type { ScriptOutcome, ScriptedResponse } from "./scripts";

// ---- engine ----

export function executeRequest(spec: RequestSpec): Promise<ResponseData> {
  return invoke("execute_request", { spec });
}

export function cancelRequest(requestId: string): Promise<boolean> {
  return invoke("cancel_request", { requestId });
}

// ---- resolve (interpolate → send / redacted preview) ----

/** Resolve env + secrets in Rust, then send. The FE passes the templated
 *  StoredRequest verbatim; interpolation/SigV4 never happen on the frontend. */
export function resolveAndSend(
  request: StoredRequest,
  environmentId: string | null,
): Promise<ResponseData> {
  return invoke("resolve_and_send", { request, environmentId });
}

/** Resolve + send with the FULL script contract: runs the pre-script (mutate +
 *  fail-closed), interpolates, sends, then runs the post-script over the
 *  response. Returns `{ response, pre?, post? }`. Keys match the Rust params. */
export function resolveAndSendScripted(
  request: StoredRequest,
  environmentId: string | null,
): Promise<ScriptedResponse> {
  return invoke("resolve_and_send_scripted", { request, environmentId });
}

/** Build a REDACTED cURL preview in Rust (secrets replaced with "•••"). The FE
 *  must never call `to_curl` for previews — redaction is Rust's responsibility. */
export function resolvePreviewCurl(
  request: StoredRequest,
  environmentId: string | null,
): Promise<string> {
  return invoke("resolve_preview_curl", { request, environmentId });
}

// ---- pre/post-request scripts (QuickJS sandbox) ----

/** Run a PRE script against a stored request snapshot in the sandbox (editor
 *  "Run" button). Keys match the Rust command params exactly. */
export function runPreScript(
  request: StoredRequest,
  environmentId: string | null,
  script: string,
): Promise<ScriptOutcome> {
  return invoke("run_pre_script", { request, environmentId, script });
}

/** Run a POST script against a given response + run-var map in the sandbox. */
export function runPostScript(
  response: ResponseData,
  script: string,
  variables: Record<string, string>,
): Promise<ScriptOutcome> {
  return invoke("run_post_script", { response, script, variables });
}

// ---- GraphQL subscriptions (long-lived WebSocket, graphql-transport-ws) ----

/** Open a subscription in Rust and return its id. Events stream on "gql-sub";
 *  `connectionPayload` is an optional custom connection_init payload (may hold
 *  {{...}}, resolved in Rust). Keys match the Rust command params exactly. */
export function subscriptionStart(
  request: StoredRequest,
  environmentId: string | null,
  connectionPayload?: unknown,
): Promise<string> {
  return invoke("subscription_start", {
    request,
    environmentId,
    connectionPayload: connectionPayload ?? null,
  });
}

/** Stop a live subscription. Resolves `false` if the id already finished. */
export function subscriptionStop(id: string): Promise<boolean> {
  return invoke("subscription_stop", { id });
}

// ---- interpolation ----

export function previewTemplate(
  input: string,
  environmentId: string | null,
): Promise<string> {
  return invoke("preview_template", { input, environmentId });
}

// ---- collections ----

export function listCollections(): Promise<Collection[]> {
  return invoke("list_collections");
}

export function upsertCollection(collection: Collection): Promise<Collection> {
  return invoke("upsert_collection", { collection });
}

export function deleteCollection(id: string): Promise<void> {
  return invoke("delete_collection", { id });
}

// ---- requests ----

export function listRequests(
  collectionId: string | null,
): Promise<StoredRequest[]> {
  return invoke("list_requests", { collectionId });
}

export function upsertRequest(request: StoredRequest): Promise<StoredRequest> {
  return invoke("upsert_request", { request });
}

export function deleteRequest(id: string): Promise<void> {
  return invoke("delete_request", { id });
}

// ---- environments ----

export function listEnvironments(): Promise<Environment[]> {
  return invoke("list_environments");
}

export function upsertEnvironment(
  environment: Environment,
): Promise<Environment> {
  return invoke("upsert_environment", { environment });
}

export function deleteEnvironment(id: string): Promise<void> {
  return invoke("delete_environment", { id });
}

export function getActiveEnvironmentId(): Promise<string | null> {
  return invoke("get_active_environment_id");
}

export function setActiveEnvironment(id: string | null): Promise<void> {
  return invoke("set_active_environment", { id });
}

// ---- history ----

export function historyList(
  requestId: string | null,
  limit: number | null,
): Promise<HistoryEntry[]> {
  return invoke("history_list", { requestId, limit });
}

export function historyClear(): Promise<void> {
  return invoke("history_clear");
}

// ---- GraphQL schema cache ----

export function gqlSchemaGet(endpointUrl: string): Promise<string | null> {
  return invoke("gql_schema_get", { endpointUrl });
}

export function gqlSchemaPut(
  endpointUrl: string,
  introspectionJson: string,
): Promise<void> {
  return invoke("gql_schema_put", { endpointUrl, introspectionJson });
}

// ---- snapshots (one baseline per request) ----

export function snapshotGet(requestId: string): Promise<SnapshotRecord | null> {
  return invoke("snapshot_get", { requestId });
}

export function snapshotPut(record: SnapshotRecord): Promise<SnapshotRecord> {
  return invoke("snapshot_put", { record });
}

export function snapshotDelete(requestId: string): Promise<void> {
  return invoke("snapshot_delete", { requestId });
}

// ---- workflows (visual graph + executor) ----

export function workflowList(): Promise<Workflow[]> {
  return invoke("workflow_list");
}

export function workflowUpsert(workflow: Workflow): Promise<Workflow> {
  return invoke("workflow_upsert", { workflow });
}

export function workflowDelete(id: string): Promise<void> {
  return invoke("workflow_delete", { id });
}

/** Start a workflow run in Rust; returns its run_id. Per-node progress streams on
 *  the "workflow-run" channel. Makes REAL network requests — always behind a
 *  confirm on the FE. Keys match the Rust command params exactly. */
export function workflowRun(
  workflow: Workflow,
  environmentId: string | null,
): Promise<string> {
  return invoke("workflow_run", { workflow, environmentId });
}

/** Stop a live run. Resolves `false` if the run already finished. */
export function workflowStop(runId: string): Promise<boolean> {
  return invoke("workflow_stop", { runId });
}

// ---- secrets (Keychain) ----

export function secretSet(name: string, value: string): Promise<void> {
  return invoke("secret_set", { name, value });
}

export function secretExists(name: string): Promise<boolean> {
  return invoke("secret_exists", { name });
}

export function secretDelete(name: string): Promise<void> {
  return invoke("secret_delete", { name });
}

// ---- curl round-trip ----

export function toCurl(spec: RequestSpec, redact: boolean): Promise<string> {
  return invoke("to_curl", { spec, redact });
}

export function fromCurl(command: string): Promise<RequestSpec> {
  return invoke("from_curl", { command });
}

// ---- importers ----

export function importPostman(json: string): Promise<ImportResult> {
  return invoke("import_postman", { json });
}

export function importInsomnia(json: string): Promise<ImportResult> {
  return invoke("import_insomnia", { json });
}

export function importHar(json: string): Promise<ImportResult> {
  return invoke("import_har", { json });
}

export function importHttpFile(text: string): Promise<ImportResult> {
  return invoke("import_http_file", { text });
}

export function scanShellHistoryCurls(
  limit: number | null,
): Promise<string[]> {
  return invoke("scan_shell_history_curls", { limit });
}
