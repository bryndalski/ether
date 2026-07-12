//! SQLite persistence (rusqlite, bundled): collections, requests,
//! environments, history, GraphQL schema cache. Single connection behind a
//! mutex, migrations run at startup via `init`.

use crate::models::{
    Auth, Body, Collection, Environment, GraphqlMeta, HistoryEntry, KeyValue, RequestOptions,
    RequestSpec, StoredRequest,
};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const DEFAULT_HISTORY_LIMIT: u32 = 50;
const HISTORY_RETENTION: i64 = 1000;

/// Placeholder written in place of any secret value before persistence.
const REDACTED: &str = "•••";

/// Header names (case-insensitive) whose values carry credentials.
const SECRET_HEADER_NAMES: [&str; 4] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "x-api-key",
];

/// Query-param name fragments (case-insensitive) that mark a value as secret.
const SECRET_QUERY_FRAGMENTS: [&str; 3] = ["key", "token", "secret"];

static CONNECTION: OnceLock<Mutex<Connection>> = OnceLock::new();

fn connection() -> Result<&'static Mutex<Connection>, String> {
    CONNECTION
        .get()
        .ok_or_else(|| "store not initialised".to_string())
}

/// Open the database, run migrations and register managed state.
/// Called once from the Tauri setup hook.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create app dir: {e}"))?;
    let db_path = dir.join("lokowka.db");
    let conn = Connection::open(&db_path).map_err(sql_err)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(sql_err)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(sql_err)?;
    migrate(&conn)?;
    CONNECTION
        .set(Mutex::new(conn))
        .map_err(|_| "store already initialised".to_string())
}

/// In-memory connection for tests; foreign keys enforced so cascade tests
/// exercise the real schema. Safe to call repeatedly — later calls no-op.
#[cfg(test)]
pub(crate) fn init_in_memory() -> Result<(), String> {
    if CONNECTION.get().is_some() {
        return Ok(());
    }
    let conn = Connection::open_in_memory().map_err(sql_err)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(sql_err)?;
    migrate(&conn)?;
    let _ = CONNECTION.set(Mutex::new(conn));
    Ok(())
}

fn sql_err(e: rusqlite::Error) -> String {
    format!("sqlite: {e}")
}

fn json_err(e: serde_json::Error) -> String {
    format!("json: {e}")
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
         CREATE TABLE IF NOT EXISTS collections (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             parent_id TEXT,
             sort_order INTEGER NOT NULL DEFAULT 0,
             docs_md TEXT
         );
         CREATE TABLE IF NOT EXISTS requests (
             id TEXT PRIMARY KEY,
             collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
             name TEXT NOT NULL,
             method TEXT NOT NULL,
             url TEXT NOT NULL,
             headers_json TEXT NOT NULL,
             query_params_json TEXT NOT NULL,
             body_json TEXT NOT NULL,
             auth_json TEXT NOT NULL,
             options_json TEXT NOT NULL,
             sort_order INTEGER NOT NULL DEFAULT 0,
             docs_md TEXT,
             graphql_json TEXT
         );
         CREATE TABLE IF NOT EXISTS environments (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             parent_id TEXT,
             color TEXT,
             variables_json TEXT NOT NULL,
             secret_names_json TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS app_state (
             key TEXT PRIMARY KEY,
             value TEXT
         );
         CREATE TABLE IF NOT EXISTS history (
             id TEXT PRIMARY KEY,
             request_id TEXT,
             executed_at TEXT NOT NULL,
             request_json TEXT NOT NULL,
             response_json TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS gql_schema_cache (
             endpoint_url TEXT PRIMARY KEY,
             introspection_json TEXT NOT NULL,
             fetched_at TEXT NOT NULL
         );",
    )
    .map_err(sql_err)?;

    let current: Option<i64> = conn
        .query_row("SELECT version FROM schema_version LIMIT 1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(sql_err)?;
    if current.is_none() {
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])
            .map_err(sql_err)?;
    }
    Ok(())
}

fn new_id(existing: &str) -> String {
    if existing.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        existing.to_string()
    }
}

// ---------- collections ----------

fn row_to_collection(row: &Row) -> rusqlite::Result<Collection> {
    Ok(Collection {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        sort_order: row.get(3)?,
        docs_md: row.get(4)?,
    })
}

#[tauri::command]
pub fn list_collections() -> Result<Vec<Collection>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut stmt = guard
        .prepare("SELECT id, name, parent_id, sort_order, docs_md FROM collections ORDER BY sort_order, name")
        .map_err(sql_err)?;
    let rows = stmt
        .query_map([], row_to_collection)
        .map_err(sql_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_err)?;
    Ok(rows)
}

#[tauri::command]
pub fn upsert_collection(collection: Collection) -> Result<Collection, String> {
    let mut stored = collection;
    stored.id = new_id(&stored.id);
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO collections (id, name, parent_id, sort_order, docs_md)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 parent_id = excluded.parent_id,
                 sort_order = excluded.sort_order,
                 docs_md = excluded.docs_md",
            params![
                stored.id,
                stored.name,
                stored.parent_id,
                stored.sort_order,
                stored.docs_md
            ],
        )
        .map_err(sql_err)?;
    Ok(stored)
}

#[tauri::command]
pub fn delete_collection(id: String) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    // Re-parent children to the root (parent_id NULL) first: there is no FK on
    // collections.parent_id, so deleting a parent would otherwise leave child
    // rows pointing at a vanished id (dangling references, invisible in trees).
    guard
        .execute(
            "UPDATE collections SET parent_id = NULL WHERE parent_id = ?1",
            params![id],
        )
        .map_err(sql_err)?;
    guard
        .execute("DELETE FROM collections WHERE id = ?1", params![id])
        .map_err(sql_err)?;
    Ok(())
}

// ---------- requests ----------

fn row_to_request(row: &Row) -> Result<StoredRequest, String> {
    let headers: Vec<KeyValue> =
        serde_json::from_str(&row.get::<_, String>(5).map_err(sql_err)?).map_err(json_err)?;
    let query_params: Vec<KeyValue> =
        serde_json::from_str(&row.get::<_, String>(6).map_err(sql_err)?).map_err(json_err)?;
    let body: Body =
        serde_json::from_str(&row.get::<_, String>(7).map_err(sql_err)?).map_err(json_err)?;
    let auth: Auth =
        serde_json::from_str(&row.get::<_, String>(8).map_err(sql_err)?).map_err(json_err)?;
    let options: RequestOptions =
        serde_json::from_str(&row.get::<_, String>(9).map_err(sql_err)?).map_err(json_err)?;
    let graphql: Option<GraphqlMeta> = match row.get::<_, Option<String>>(12).map_err(sql_err)? {
        Some(raw) => Some(serde_json::from_str(&raw).map_err(json_err)?),
        None => None,
    };
    Ok(StoredRequest {
        id: row.get(0).map_err(sql_err)?,
        collection_id: row.get(1).map_err(sql_err)?,
        name: row.get(2).map_err(sql_err)?,
        method: row.get(3).map_err(sql_err)?,
        url: row.get(4).map_err(sql_err)?,
        headers,
        query_params,
        body,
        auth,
        options,
        sort_order: row.get(10).map_err(sql_err)?,
        docs_md: row.get(11).map_err(sql_err)?,
        graphql,
    })
}

#[tauri::command]
pub fn list_requests(collection_id: Option<String>) -> Result<Vec<StoredRequest>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut collected = Vec::new();
    if let Some(cid) = collection_id {
        let mut stmt = guard
            .prepare(
                "SELECT id, collection_id, name, method, url, headers_json, query_params_json, \
                 body_json, auth_json, options_json, sort_order, docs_md, graphql_json \
                 FROM requests WHERE collection_id = ?1 ORDER BY sort_order, name",
            )
            .map_err(sql_err)?;
        let mut rows = stmt.query(params![cid]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            collected.push(row_to_request(row)?);
        }
    } else {
        let mut stmt = guard
            .prepare(
                "SELECT id, collection_id, name, method, url, headers_json, query_params_json, \
                 body_json, auth_json, options_json, sort_order, docs_md, graphql_json \
                 FROM requests ORDER BY sort_order, name",
            )
            .map_err(sql_err)?;
        let mut rows = stmt.query([]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            collected.push(row_to_request(row)?);
        }
    }
    Ok(collected)
}

#[tauri::command]
pub fn upsert_request(request: StoredRequest) -> Result<StoredRequest, String> {
    let mut stored = request;
    stored.id = new_id(&stored.id);
    let headers_json = serde_json::to_string(&stored.headers).map_err(json_err)?;
    let query_params_json = serde_json::to_string(&stored.query_params).map_err(json_err)?;
    let body_json = serde_json::to_string(&stored.body).map_err(json_err)?;
    let auth_json = serde_json::to_string(&stored.auth).map_err(json_err)?;
    let options_json = serde_json::to_string(&stored.options).map_err(json_err)?;
    let graphql_json = match &stored.graphql {
        Some(meta) => Some(serde_json::to_string(meta).map_err(json_err)?),
        None => None,
    };
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO requests (id, collection_id, name, method, url, headers_json, \
             query_params_json, body_json, auth_json, options_json, sort_order, docs_md, graphql_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) \
             ON CONFLICT(id) DO UPDATE SET \
                 collection_id = excluded.collection_id, \
                 name = excluded.name, \
                 method = excluded.method, \
                 url = excluded.url, \
                 headers_json = excluded.headers_json, \
                 query_params_json = excluded.query_params_json, \
                 body_json = excluded.body_json, \
                 auth_json = excluded.auth_json, \
                 options_json = excluded.options_json, \
                 sort_order = excluded.sort_order, \
                 docs_md = excluded.docs_md, \
                 graphql_json = excluded.graphql_json",
            params![
                stored.id,
                stored.collection_id,
                stored.name,
                stored.method,
                stored.url,
                headers_json,
                query_params_json,
                body_json,
                auth_json,
                options_json,
                stored.sort_order,
                stored.docs_md,
                graphql_json
            ],
        )
        .map_err(sql_err)?;
    Ok(stored)
}

#[tauri::command]
pub fn delete_request(id: String) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute("DELETE FROM requests WHERE id = ?1", params![id])
        .map_err(sql_err)?;
    Ok(())
}

// ---------- environments ----------

fn row_to_environment(row: &Row) -> Result<Environment, String> {
    let variables: Vec<KeyValue> =
        serde_json::from_str(&row.get::<_, String>(4).map_err(sql_err)?).map_err(json_err)?;
    let secret_names: Vec<String> =
        serde_json::from_str(&row.get::<_, String>(5).map_err(sql_err)?).map_err(json_err)?;
    Ok(Environment {
        id: row.get(0).map_err(sql_err)?,
        name: row.get(1).map_err(sql_err)?,
        parent_id: row.get(2).map_err(sql_err)?,
        color: row.get(3).map_err(sql_err)?,
        variables,
        secret_names,
    })
}

#[tauri::command]
pub fn list_environments() -> Result<Vec<Environment>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut stmt = guard
        .prepare("SELECT id, name, parent_id, color, variables_json, secret_names_json FROM environments ORDER BY name")
        .map_err(sql_err)?;
    let mut rows = stmt.query([]).map_err(sql_err)?;
    let mut collected = Vec::new();
    while let Some(row) = rows.next().map_err(sql_err)? {
        collected.push(row_to_environment(row)?);
    }
    Ok(collected)
}

#[tauri::command]
pub fn upsert_environment(environment: Environment) -> Result<Environment, String> {
    let mut stored = environment;
    stored.id = new_id(&stored.id);
    let variables_json = serde_json::to_string(&stored.variables).map_err(json_err)?;
    let secret_names_json = serde_json::to_string(&stored.secret_names).map_err(json_err)?;
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO environments (id, name, parent_id, color, variables_json, secret_names_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 parent_id = excluded.parent_id,
                 color = excluded.color,
                 variables_json = excluded.variables_json,
                 secret_names_json = excluded.secret_names_json",
            params![
                stored.id,
                stored.name,
                stored.parent_id,
                stored.color,
                variables_json,
                secret_names_json
            ],
        )
        .map_err(sql_err)?;
    Ok(stored)
}

#[tauri::command]
pub fn delete_environment(id: String) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute("DELETE FROM environments WHERE id = ?1", params![id])
        .map_err(sql_err)?;
    // Clear the active pointer when it referenced the removed environment.
    guard
        .execute(
            "DELETE FROM app_state WHERE key = 'active_environment_id' AND value = ?1",
            params![id],
        )
        .map_err(sql_err)?;
    Ok(())
}

// ---------- active environment (app_state) ----------

const ACTIVE_ENV_KEY: &str = "active_environment_id";

#[tauri::command]
pub fn get_active_environment_id() -> Result<Option<String>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let value: Option<String> = guard
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            params![ACTIVE_ENV_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(sql_err)?
        .flatten();
    Ok(value)
}

#[tauri::command]
pub fn set_active_environment(id: Option<String>) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    match id {
        Some(env_id) => guard
            .execute(
                "INSERT INTO app_state (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![ACTIVE_ENV_KEY, env_id],
            )
            .map_err(sql_err)?,
        None => guard
            .execute(
                "DELETE FROM app_state WHERE key = ?1",
                params![ACTIVE_ENV_KEY],
            )
            .map_err(sql_err)?,
    };
    Ok(())
}

// ---------- history ----------

fn row_to_history(row: &Row) -> Result<HistoryEntry, String> {
    let request =
        serde_json::from_str(&row.get::<_, String>(3).map_err(sql_err)?).map_err(json_err)?;
    let response =
        serde_json::from_str(&row.get::<_, String>(4).map_err(sql_err)?).map_err(json_err)?;
    Ok(HistoryEntry {
        id: row.get(0).map_err(sql_err)?,
        request_id: row.get(1).map_err(sql_err)?,
        executed_at: row.get(2).map_err(sql_err)?,
        request,
        response,
    })
}

#[tauri::command]
pub fn history_list(
    request_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<HistoryEntry>, String> {
    // `None` falls back to the default page size; an explicit `Some(0)` means
    // "no limit" (SQLite treats a negative LIMIT as unbounded).
    let effective_limit = match limit {
        None => DEFAULT_HISTORY_LIMIT as i64,
        Some(0) => -1,
        Some(value) => value as i64,
    };
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut collected = Vec::new();
    if let Some(rid) = request_id {
        let mut stmt = guard
            .prepare(
                "SELECT id, request_id, executed_at, request_json, response_json FROM history \
                 WHERE request_id = ?1 ORDER BY executed_at DESC, rowid DESC LIMIT ?2",
            )
            .map_err(sql_err)?;
        let mut rows = stmt.query(params![rid, effective_limit]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            collected.push(row_to_history(row)?);
        }
    } else {
        let mut stmt = guard
            .prepare(
                "SELECT id, request_id, executed_at, request_json, response_json FROM history \
                 ORDER BY executed_at DESC, rowid DESC LIMIT ?1",
            )
            .map_err(sql_err)?;
        let mut rows = stmt.query(params![effective_limit]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            collected.push(row_to_history(row)?);
        }
    }
    Ok(collected)
}

/// Redact every secret-bearing field of a `RequestSpec` before it is persisted
/// to history. The stored request keeps its shape (variant, non-secret fields
/// like a Basic username) so the history view stays useful, but credential
/// values are replaced with `REDACTED`. This upholds the secrets contract that
/// resolved secret values must never land in SQLite.
///
/// SigV4 carries no secret in the spec (credentials resolve from ~/.aws by
/// profile at request time), so it is left untouched.
pub(crate) fn redact_request(spec: &RequestSpec) -> RequestSpec {
    let mut redacted = spec.clone();
    redacted.auth = redact_auth(&spec.auth);
    for header in &mut redacted.headers {
        if SECRET_HEADER_NAMES
            .iter()
            .any(|name| header.name.eq_ignore_ascii_case(name))
        {
            header.value = REDACTED.to_string();
        }
    }
    for param in &mut redacted.query_params {
        let lower = param.name.to_ascii_lowercase();
        if SECRET_QUERY_FRAGMENTS
            .iter()
            .any(|fragment| lower.contains(fragment))
        {
            param.value = REDACTED.to_string();
        }
    }
    redacted
}

fn redact_auth(auth: &Auth) -> Auth {
    match auth {
        Auth::None => Auth::None,
        Auth::Bearer { .. } => Auth::Bearer {
            token: REDACTED.to_string(),
        },
        Auth::Basic { username, .. } => Auth::Basic {
            username: username.clone(),
            password: REDACTED.to_string(),
        },
        Auth::ApiKey {
            name, placement, ..
        } => Auth::ApiKey {
            name: name.clone(),
            value: REDACTED.to_string(),
            placement: placement.clone(),
        },
        Auth::SigV4 {
            profile,
            region,
            service,
        } => Auth::SigV4 {
            profile: profile.clone(),
            region: region.clone(),
            service: service.clone(),
        },
    }
}

/// Recording happens engine-side after each execution. The request is redacted
/// before serialisation so resolved secret values never reach SQLite. After
/// each insert the table is trimmed to the newest `HISTORY_RETENTION` rows.
pub fn history_add(entry: &HistoryEntry) -> Result<(), String> {
    let id = new_id(&entry.id);
    let redacted_request = redact_request(&entry.request);
    let request_json = serde_json::to_string(&redacted_request).map_err(json_err)?;
    let response_json = serde_json::to_string(&entry.response).map_err(json_err)?;
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO history (id, request_id, executed_at, request_json, response_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                 request_id = excluded.request_id,
                 executed_at = excluded.executed_at,
                 request_json = excluded.request_json,
                 response_json = excluded.response_json",
            params![
                id,
                entry.request_id,
                entry.executed_at,
                request_json,
                response_json
            ],
        )
        .map_err(sql_err)?;
    // Prune by insertion order (rowid) so the trim is deterministic even when
    // several rows share the same `executed_at`; the oldest rowid is dropped.
    guard
        .execute(
            "DELETE FROM history WHERE id NOT IN (
                 SELECT id FROM history ORDER BY rowid DESC LIMIT ?1
             )",
            params![HISTORY_RETENTION],
        )
        .map_err(sql_err)?;
    Ok(())
}

#[tauri::command]
pub fn history_clear() -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard.execute("DELETE FROM history", []).map_err(sql_err)?;
    Ok(())
}

// ---------- GraphQL schema cache ----------

#[tauri::command]
pub fn gql_schema_get(endpoint_url: String) -> Result<Option<String>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let value: Option<String> = guard
        .query_row(
            "SELECT introspection_json FROM gql_schema_cache WHERE endpoint_url = ?1",
            params![endpoint_url],
            |r| r.get(0),
        )
        .optional()
        .map_err(sql_err)?;
    Ok(value)
}

#[tauri::command]
pub fn gql_schema_put(endpoint_url: String, introspection_json: String) -> Result<(), String> {
    let fetched_at = chrono::Utc::now().to_rfc3339();
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO gql_schema_cache (endpoint_url, introspection_json, fetched_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(endpoint_url) DO UPDATE SET
                 introspection_json = excluded.introspection_json,
                 fetched_at = excluded.fetched_at",
            params![endpoint_url, introspection_json, fetched_at],
        )
        .map_err(sql_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ApiKeyPlacement, MultipartPart, RequestSpec, ResponseData, Timings};
    use std::sync::Mutex as StdMutex;

    // Tests share one process-wide in-memory connection; serialise them and
    // reset every table so each test starts from a clean slate.
    static TEST_LOCK: StdMutex<()> = StdMutex::new(());

    fn setup() -> std::sync::MutexGuard<'static, ()> {
        let guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        init_in_memory().unwrap();
        let conn = connection().unwrap().lock().unwrap();
        conn.execute_batch(
            "DELETE FROM history;
             DELETE FROM requests;
             DELETE FROM collections;
             DELETE FROM environments;
             DELETE FROM app_state;
             DELETE FROM gql_schema_cache;",
        )
        .unwrap();
        drop(conn);
        guard
    }

    fn sample_collection(name: &str) -> Collection {
        Collection {
            id: String::new(),
            name: name.into(),
            parent_id: None,
            sort_order: 0,
            docs_md: Some("# docs".into()),
        }
    }

    fn kv(name: &str, value: &str) -> KeyValue {
        KeyValue {
            name: name.into(),
            value: value.into(),
            enabled: true,
        }
    }

    fn sample_request(collection_id: &str, body: Body, auth: Auth) -> StoredRequest {
        StoredRequest {
            id: String::new(),
            collection_id: collection_id.into(),
            name: "req".into(),
            method: "POST".into(),
            url: "https://example.test/api".into(),
            headers: vec![kv("X-Trace", "1")],
            query_params: vec![kv("page", "2")],
            body,
            auth,
            options: RequestOptions::default(),
            sort_order: 0,
            docs_md: None,
            graphql: Some(GraphqlMeta {
                operation_type: "query".into(),
                query: "{ me { id } }".into(),
                variables_json: "{}".into(),
            }),
        }
    }

    fn sample_history(id: &str, executed_at: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.into(),
            request_id: Some("req-1".into()),
            executed_at: executed_at.into(),
            request: RequestSpec {
                id: "req-1".into(),
                method: "GET".into(),
                url: "https://example.test".into(),
                headers: vec![],
                query_params: vec![],
                body: Body::None,
                auth: Auth::None,
                options: RequestOptions::default(),
            },
            response: ResponseData {
                request_id: "req-1".into(),
                status: 200,
                http_version: "2".into(),
                headers: vec![],
                body: "ok".into(),
                body_is_base64: false,
                body_truncated_at: None,
                size_download_bytes: 2,
                timings: Timings::default(),
                effective_url: "https://example.test".into(),
                redirect_chain: vec![],
                verbose_log: String::new(),
                tls: None,
            },
        }
    }

    #[test]
    fn collection_upsert_generates_id_and_lists() {
        let _g = setup();
        let created = upsert_collection(sample_collection("Root")).unwrap();
        assert!(!created.id.is_empty(), "empty id should be filled");
        let listed = list_collections().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], created);
    }

    #[test]
    fn collection_upsert_updates_in_place() {
        let _g = setup();
        let mut created = upsert_collection(sample_collection("Old")).unwrap();
        created.name = "New".into();
        let updated = upsert_collection(created.clone()).unwrap();
        assert_eq!(updated.id, created.id);
        let listed = list_collections().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "New");
    }

    #[test]
    fn request_round_trip_raw_body_bearer_auth() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = sample_request(
            &coll.id,
            Body::Raw {
                content_type: "application/json".into(),
                text: "{\"a\":1}".into(),
            },
            Auth::Bearer {
                token: "tok".into(),
            },
        );
        let stored = upsert_request(req).unwrap();
        let listed = list_requests(Some(coll.id.clone())).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], stored);
    }

    #[test]
    fn request_round_trip_formurlencoded_basic_auth() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = sample_request(
            &coll.id,
            Body::FormUrlencoded {
                fields: vec![kv("grant", "code")],
            },
            Auth::Basic {
                username: "u".into(),
                password: "p".into(),
            },
        );
        let stored = upsert_request(req).unwrap();
        let listed = list_requests(None).unwrap();
        assert_eq!(listed, vec![stored]);
    }

    #[test]
    fn request_round_trip_multipart_apikey_auth() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = sample_request(
            &coll.id,
            Body::Multipart {
                parts: vec![
                    MultipartPart::Text {
                        name: "field".into(),
                        value: "v".into(),
                    },
                    MultipartPart::File {
                        name: "upload".into(),
                        path: "/tmp/x.bin".into(),
                        content_type: Some("application/octet-stream".into()),
                    },
                ],
            },
            Auth::ApiKey {
                name: "X-Key".into(),
                value: "secret".into(),
                placement: ApiKeyPlacement::Header,
            },
        );
        let stored = upsert_request(req).unwrap();
        let listed = list_requests(Some(coll.id)).unwrap();
        assert_eq!(listed, vec![stored]);
    }

    #[test]
    fn request_round_trip_none_body_sigv4_auth() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = sample_request(
            &coll.id,
            Body::None,
            Auth::SigV4 {
                profile: "default".into(),
                region: "eu-central-1".into(),
                service: "execute-api".into(),
            },
        );
        let stored = upsert_request(req).unwrap();
        let listed = list_requests(Some(coll.id)).unwrap();
        assert_eq!(listed, vec![stored]);
    }

    #[test]
    fn delete_collection_cascades_to_requests() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();
        upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();
        assert_eq!(list_requests(Some(coll.id.clone())).unwrap().len(), 2);
        delete_collection(coll.id.clone()).unwrap();
        assert!(list_requests(Some(coll.id)).unwrap().is_empty());
    }

    #[test]
    fn environment_round_trip_and_delete() {
        let _g = setup();
        let env = Environment {
            id: String::new(),
            name: "Prod".into(),
            parent_id: None,
            color: Some("#4f46e5".into()),
            variables: vec![kv("base_url", "https://api.test")],
            secret_names: vec!["api_token".into()],
        };
        let stored = upsert_environment(env).unwrap();
        assert!(!stored.id.is_empty());
        assert_eq!(list_environments().unwrap(), vec![stored.clone()]);
        delete_environment(stored.id).unwrap();
        assert!(list_environments().unwrap().is_empty());
    }

    #[test]
    fn active_environment_set_get_and_clear() {
        let _g = setup();
        assert_eq!(get_active_environment_id().unwrap(), None);
        set_active_environment(Some("env-1".into())).unwrap();
        assert_eq!(get_active_environment_id().unwrap(), Some("env-1".into()));
        set_active_environment(None).unwrap();
        assert_eq!(get_active_environment_id().unwrap(), None);
    }

    #[test]
    fn deleting_active_environment_clears_pointer() {
        let _g = setup();
        let env = upsert_environment(Environment {
            id: String::new(),
            name: "E".into(),
            parent_id: None,
            color: None,
            variables: vec![],
            secret_names: vec![],
        })
        .unwrap();
        set_active_environment(Some(env.id.clone())).unwrap();
        delete_environment(env.id).unwrap();
        assert_eq!(get_active_environment_id().unwrap(), None);
    }

    #[test]
    fn history_add_list_and_default_limit() {
        let _g = setup();
        for i in 0..60 {
            let ts = format!("2026-07-12T00:{:02}:00Z", i);
            history_add(&sample_history(&format!("h-{i}"), &ts)).unwrap();
        }
        let default_page = history_list(None, None).unwrap();
        assert_eq!(default_page.len(), DEFAULT_HISTORY_LIMIT as usize);
        // Newest first.
        assert_eq!(default_page[0].executed_at, "2026-07-12T00:59:00Z");
        let smaller = history_list(None, Some(5)).unwrap();
        assert_eq!(smaller.len(), 5);
    }

    #[test]
    fn history_prunes_to_retention_cap() {
        let _g = setup();
        for i in 0..(HISTORY_RETENTION + 25) {
            let ts = format!("2026-07-12T{:07}Z", i);
            history_add(&sample_history(&format!("h-{i}"), &ts)).unwrap();
        }
        let total = history_list(None, Some(u32::MAX)).unwrap();
        assert_eq!(total.len(), HISTORY_RETENTION as usize);
    }

    #[test]
    fn history_filter_by_request_id_and_clear() {
        let _g = setup();
        let mut other = sample_history("h-other", "2026-07-12T01:00:00Z");
        other.request_id = Some("req-2".into());
        history_add(&other).unwrap();
        history_add(&sample_history("h-mine", "2026-07-12T02:00:00Z")).unwrap();
        let mine = history_list(Some("req-1".into()), None).unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].id, "h-mine");
        history_clear().unwrap();
        assert!(history_list(None, None).unwrap().is_empty());
    }

    #[test]
    fn gql_cache_upsert_and_get() {
        let _g = setup();
        assert_eq!(gql_schema_get("https://gql.test".into()).unwrap(), None);
        gql_schema_put("https://gql.test".into(), "{\"v\":1}".into()).unwrap();
        assert_eq!(
            gql_schema_get("https://gql.test".into()).unwrap(),
            Some("{\"v\":1}".into())
        );
        gql_schema_put("https://gql.test".into(), "{\"v\":2}".into()).unwrap();
        assert_eq!(
            gql_schema_get("https://gql.test".into()).unwrap(),
            Some("{\"v\":2}".into())
        );
    }

    fn spec_with(auth: Auth, headers: Vec<KeyValue>, query_params: Vec<KeyValue>) -> RequestSpec {
        RequestSpec {
            id: "req-1".into(),
            method: "GET".into(),
            url: "https://example.test".into(),
            headers,
            query_params,
            body: Body::None,
            auth,
            options: RequestOptions::default(),
        }
    }

    #[test]
    fn redact_request_bearer_hides_token() {
        let redacted = redact_request(&spec_with(
            Auth::Bearer {
                token: "super-secret".into(),
            },
            vec![],
            vec![],
        ));
        assert_eq!(
            redacted.auth,
            Auth::Bearer {
                token: "•••".into()
            }
        );
    }

    #[test]
    fn redact_request_basic_keeps_username_hides_password() {
        let redacted = redact_request(&spec_with(
            Auth::Basic {
                username: "alice".into(),
                password: "hunter2".into(),
            },
            vec![],
            vec![],
        ));
        assert_eq!(
            redacted.auth,
            Auth::Basic {
                username: "alice".into(),
                password: "•••".into(),
            }
        );
    }

    #[test]
    fn redact_request_apikey_hides_value_keeps_name_and_placement() {
        let redacted = redact_request(&spec_with(
            Auth::ApiKey {
                name: "X-Key".into(),
                value: "secret".into(),
                placement: ApiKeyPlacement::Query,
            },
            vec![],
            vec![],
        ));
        assert_eq!(
            redacted.auth,
            Auth::ApiKey {
                name: "X-Key".into(),
                value: "•••".into(),
                placement: ApiKeyPlacement::Query,
            }
        );
    }

    #[test]
    fn redact_request_sigv4_unchanged() {
        let auth = Auth::SigV4 {
            profile: "default".into(),
            region: "eu-central-1".into(),
            service: "execute-api".into(),
        };
        let redacted = redact_request(&spec_with(auth.clone(), vec![], vec![]));
        assert_eq!(redacted.auth, auth);
    }

    #[test]
    fn redact_request_none_auth_unchanged() {
        let redacted = redact_request(&spec_with(Auth::None, vec![], vec![]));
        assert_eq!(redacted.auth, Auth::None);
    }

    #[test]
    fn redact_request_hides_secret_headers_case_insensitive() {
        let redacted = redact_request(&spec_with(
            Auth::None,
            vec![
                kv("authorization", "Bearer tok"),
                kv("Proxy-Authorization", "Basic abc"),
                kv("Cookie", "session=xyz"),
                kv("X-API-Key", "k"),
                kv("X-Trace", "keep-me"),
            ],
            vec![],
        ));
        assert_eq!(redacted.headers[0].value, "•••");
        assert_eq!(redacted.headers[1].value, "•••");
        assert_eq!(redacted.headers[2].value, "•••");
        assert_eq!(redacted.headers[3].value, "•••");
        assert_eq!(redacted.headers[4].value, "keep-me");
    }

    #[test]
    fn redact_request_hides_secret_query_params_by_name_fragment() {
        let redacted = redact_request(&spec_with(
            Auth::None,
            vec![],
            vec![
                kv("api_key", "k1"),
                kv("accessToken", "t1"),
                kv("client_secret", "s1"),
                kv("page", "2"),
            ],
        ));
        assert_eq!(redacted.query_params[0].value, "•••");
        assert_eq!(redacted.query_params[1].value, "•••");
        assert_eq!(redacted.query_params[2].value, "•••");
        assert_eq!(redacted.query_params[3].value, "2");
    }

    #[test]
    fn history_add_persists_redacted_request() {
        let _g = setup();
        let mut entry = sample_history("h-secret", "2026-07-12T00:00:00Z");
        entry.request.auth = Auth::Bearer {
            token: "leaked".into(),
        };
        entry.request.headers = vec![kv("Authorization", "Bearer leaked")];
        history_add(&entry).unwrap();
        let stored = history_list(None, None).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(
            stored[0].request.auth,
            Auth::Bearer {
                token: "•••".into()
            }
        );
        assert_eq!(stored[0].request.headers[0].value, "•••");
    }

    #[test]
    fn history_prune_timestamp_collision_drops_oldest_rowid() {
        let _g = setup();
        // Three entries with the SAME executed_at, retention effectively 2.
        // The prune must drop the oldest rowid (first inserted), not a newer one.
        let shared_ts = "2026-07-12T00:00:00Z";
        history_add(&sample_history("h-a", shared_ts)).unwrap();
        history_add(&sample_history("h-b", shared_ts)).unwrap();
        history_add(&sample_history("h-c", shared_ts)).unwrap();
        // Manually prune to newest 2 by rowid to mirror the retention logic.
        {
            let conn = connection().unwrap().lock().unwrap();
            conn.execute(
                "DELETE FROM history WHERE id NOT IN (
                     SELECT id FROM history ORDER BY rowid DESC LIMIT 2
                 )",
                [],
            )
            .unwrap();
        }
        let remaining: Vec<String> = history_list(None, Some(0))
            .unwrap()
            .into_iter()
            .map(|e| e.id)
            .collect();
        assert_eq!(remaining.len(), 2);
        assert!(!remaining.contains(&"h-a".to_string()), "oldest rowid kept");
        assert!(remaining.contains(&"h-b".to_string()));
        assert!(remaining.contains(&"h-c".to_string()));
    }

    #[test]
    fn history_list_zero_limit_means_no_limit() {
        let _g = setup();
        for i in 0..60 {
            let ts = format!("2026-07-12T00:{:02}:00Z", i);
            history_add(&sample_history(&format!("h-{i}"), &ts)).unwrap();
        }
        let all = history_list(None, Some(0)).unwrap();
        assert_eq!(all.len(), 60);
    }

    #[test]
    fn delete_collection_reparents_children_to_root() {
        let _g = setup();
        let parent = upsert_collection(sample_collection("Parent")).unwrap();
        let mut child = sample_collection("Child");
        child.parent_id = Some(parent.id.clone());
        let child = upsert_collection(child).unwrap();
        delete_collection(parent.id).unwrap();
        let listed = list_collections().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, child.id);
        assert_eq!(listed[0].parent_id, None, "no dangling parent reference");
    }
}
