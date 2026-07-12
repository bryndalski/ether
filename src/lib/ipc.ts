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
  StoredRequest,
} from "./types";

// ---- engine ----

export function executeRequest(spec: RequestSpec): Promise<ResponseData> {
  return invoke("execute_request", { spec });
}

export function cancelRequest(requestId: string): Promise<boolean> {
  return invoke("cancel_request", { requestId });
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
