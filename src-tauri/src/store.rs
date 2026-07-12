//! SQLite persistence (rusqlite, bundled): collections, requests,
//! environments, history, GraphQL schema cache. Single connection behind a
//! mutex, migrations run at startup via `init`.

use crate::models::{Collection, Environment, HistoryEntry, StoredRequest};
use tauri::AppHandle;

/// Open the database, run migrations and register managed state.
/// Called once from the Tauri setup hook.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let _ = app;
    // Implemented by the store work stream; a no-op keeps the app bootable.
    Ok(())
}

#[tauri::command]
pub fn list_collections() -> Result<Vec<Collection>, String> {
    Err("not implemented: store::list_collections".into())
}

#[tauri::command]
pub fn upsert_collection(collection: Collection) -> Result<Collection, String> {
    let _ = collection;
    Err("not implemented: store::upsert_collection".into())
}

#[tauri::command]
pub fn delete_collection(id: String) -> Result<(), String> {
    let _ = id;
    Err("not implemented: store::delete_collection".into())
}

#[tauri::command]
pub fn list_requests(collection_id: Option<String>) -> Result<Vec<StoredRequest>, String> {
    let _ = collection_id;
    Err("not implemented: store::list_requests".into())
}

#[tauri::command]
pub fn upsert_request(request: StoredRequest) -> Result<StoredRequest, String> {
    let _ = request;
    Err("not implemented: store::upsert_request".into())
}

#[tauri::command]
pub fn delete_request(id: String) -> Result<(), String> {
    let _ = id;
    Err("not implemented: store::delete_request".into())
}

#[tauri::command]
pub fn list_environments() -> Result<Vec<Environment>, String> {
    Err("not implemented: store::list_environments".into())
}

#[tauri::command]
pub fn upsert_environment(environment: Environment) -> Result<Environment, String> {
    let _ = environment;
    Err("not implemented: store::upsert_environment".into())
}

#[tauri::command]
pub fn delete_environment(id: String) -> Result<(), String> {
    let _ = id;
    Err("not implemented: store::delete_environment".into())
}

#[tauri::command]
pub fn get_active_environment_id() -> Result<Option<String>, String> {
    Err("not implemented: store::get_active_environment_id".into())
}

#[tauri::command]
pub fn set_active_environment(id: Option<String>) -> Result<(), String> {
    let _ = id;
    Err("not implemented: store::set_active_environment".into())
}

#[tauri::command]
pub fn history_list(
    request_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<HistoryEntry>, String> {
    let _ = (request_id, limit);
    Err("not implemented: store::history_list".into())
}

/// Recording happens engine-side after each execution.
pub fn history_add(entry: &HistoryEntry) -> Result<(), String> {
    let _ = entry;
    Err("not implemented: store::history_add".into())
}

#[tauri::command]
pub fn history_clear() -> Result<(), String> {
    Err("not implemented: store::history_clear".into())
}

#[tauri::command]
pub fn gql_schema_get(endpoint_url: String) -> Result<Option<String>, String> {
    let _ = endpoint_url;
    Err("not implemented: store::gql_schema_get".into())
}

#[tauri::command]
pub fn gql_schema_put(endpoint_url: String, introspection_json: String) -> Result<(), String> {
    let _ = (endpoint_url, introspection_json);
    Err("not implemented: store::gql_schema_put".into())
}
