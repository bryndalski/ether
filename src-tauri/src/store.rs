//! SQLite persistence (rusqlite, bundled): collections, requests,
//! environments, history, GraphQL schema cache. Single connection behind a
//! mutex, migrations run at startup via `init`.

use crate::models::{
    Assertion, Auth, Body, Collection, Environment, GraphqlMeta, HistoryEntry, KeyValue,
    RequestOptions, RequestSpec, ScrubConfig, SnapshotRecord, StoredRequest, Workflow,
    WorkflowEdge, WorkflowNode,
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
    let db_path = dir.join("ether.db");
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
         );
         CREATE TABLE IF NOT EXISTS snapshots (
             request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
             baseline_json TEXT NOT NULL,
             scrub_paths_json TEXT NOT NULL,
             created_at TEXT NOT NULL
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

    // v2: scriptless assertions. Additive, nullable column on `requests`; an old
    // row reads `assertions_json = NULL → assertions = []`. The `let _ =` swallows
    // the "duplicate column name" error when a fresh DB already had the column
    // added on a prior run, so the migration is idempotent.
    let version = current.unwrap_or(1);
    if version < 2 {
        let _ = conn.execute("ALTER TABLE requests ADD COLUMN assertions_json TEXT", []);
        conn.execute("UPDATE schema_version SET version = 2", [])
            .map_err(sql_err)?;
    }

    // v3: visual workflows. New standalone table; no change to existing tables, so a
    // downgrade just ignores it (backward-compatible). Idempotent CREATE IF NOT EXISTS.
    if version < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workflows (
                 id TEXT PRIMARY KEY,
                 name TEXT NOT NULL,
                 graph_json TEXT NOT NULL,
                 created_at TEXT NOT NULL
             );",
        )
        .map_err(sql_err)?;
        conn.execute("UPDATE schema_version SET version = 3", [])
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
    // NULL / empty (old, pre-v2 rows) → []. Never errors on a missing column value.
    let assertions: Vec<Assertion> = match row.get::<_, Option<String>>(13).map_err(sql_err)? {
        Some(raw) if !raw.is_empty() => serde_json::from_str(&raw).map_err(json_err)?,
        _ => Vec::new(),
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
        assertions,
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
                 body_json, auth_json, options_json, sort_order, docs_md, graphql_json, \
                 assertions_json \
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
                 body_json, auth_json, options_json, sort_order, docs_md, graphql_json, \
                 assertions_json \
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
    // Default `[]` serializes to "[]", never NULL going forward — only genuinely
    // pre-migration rows read as NULL.
    let assertions_json = serde_json::to_string(&stored.assertions).map_err(json_err)?;
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO requests (id, collection_id, name, method, url, headers_json, \
             query_params_json, body_json, auth_json, options_json, sort_order, docs_md, graphql_json, \
             assertions_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
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
                 graphql_json = excluded.graphql_json, \
                 assertions_json = excluded.assertions_json",
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
                graphql_json,
                assertions_json
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

// ---------- snapshots (baseline per request) ----------

#[tauri::command]
pub fn snapshot_get(request_id: String) -> Result<Option<SnapshotRecord>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let row: Option<(String, String, String)> = guard
        .query_row(
            "SELECT baseline_json, scrub_paths_json, created_at FROM snapshots WHERE request_id = ?1",
            params![request_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(sql_err)?;
    match row {
        Some((baseline_json, scrub_paths_json, created_at)) => {
            let baseline = serde_json::from_str(&baseline_json).map_err(json_err)?;
            let scrub_config: ScrubConfig =
                serde_json::from_str(&scrub_paths_json).map_err(json_err)?;
            Ok(Some(SnapshotRecord {
                request_id,
                baseline,
                scrub_config,
                created_at,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn snapshot_put(record: SnapshotRecord) -> Result<SnapshotRecord, String> {
    let mut stored = record;
    // A fresh Save or a re-stamp on Accept both land here; default the timestamp.
    if stored.created_at.is_empty() {
        stored.created_at = chrono::Utc::now().to_rfc3339();
    }
    let baseline_json = serde_json::to_string(&stored.baseline).map_err(json_err)?;
    let scrub_paths_json = serde_json::to_string(&stored.scrub_config).map_err(json_err)?;
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "INSERT INTO snapshots (request_id, baseline_json, scrub_paths_json, created_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(request_id) DO UPDATE SET
                 baseline_json = excluded.baseline_json,
                 scrub_paths_json = excluded.scrub_paths_json,
                 created_at = excluded.created_at",
            params![
                stored.request_id,
                baseline_json,
                scrub_paths_json,
                stored.created_at
            ],
        )
        .map_err(sql_err)?;
    Ok(stored)
}

#[tauri::command]
pub fn snapshot_delete(request_id: String) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute(
            "DELETE FROM snapshots WHERE request_id = ?1",
            params![request_id],
        )
        .map_err(sql_err)?;
    Ok(())
}

// ---------- workflows (visual graph) ----------

/// The `{ nodes, edges }` blob persisted in `workflows.graph_json`. `id`/`name`/
/// `created_at` live in their own columns (keeps list/rename cheap and mirrors how
/// `snapshots` splits `request_id` out of the blob).
#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
struct WorkflowGraph {
    #[serde(default)]
    nodes: Vec<WorkflowNode>,
    #[serde(default)]
    edges: Vec<WorkflowEdge>,
}

fn row_to_workflow(row: &Row) -> rusqlite::Result<Workflow> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let graph_json: String = row.get(2)?;
    // graph_json holds { nodes, edges }; id/name come from their own columns. A
    // corrupt blob degrades to an empty graph rather than failing the whole list.
    let graph: WorkflowGraph = serde_json::from_str(&graph_json).unwrap_or_default();
    Ok(Workflow {
        id,
        name,
        nodes: graph.nodes,
        edges: graph.edges,
    })
}

#[tauri::command]
pub fn workflow_list() -> Result<Vec<Workflow>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut stmt = guard
        .prepare("SELECT id, name, graph_json FROM workflows ORDER BY name")
        .map_err(sql_err)?;
    let rows = stmt
        .query_map([], row_to_workflow)
        .map_err(sql_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_err)?;
    Ok(rows)
}

#[tauri::command]
pub fn workflow_upsert(workflow: Workflow) -> Result<Workflow, String> {
    let mut stored = workflow;
    stored.id = new_id(&stored.id);
    let created_at = chrono::Utc::now().to_rfc3339();
    let graph_json = serde_json::to_string(&WorkflowGraph {
        nodes: stored.nodes.clone(),
        edges: stored.edges.clone(),
    })
    .map_err(json_err)?;
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    // created_at is set on first insert and kept across updates (a rename or graph
    // edit must not reset the creation time).
    guard
        .execute(
            "INSERT INTO workflows (id, name, graph_json, created_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 graph_json = excluded.graph_json",
            params![stored.id, stored.name, graph_json, created_at],
        )
        .map_err(sql_err)?;
    Ok(stored)
}

#[tauri::command]
pub fn workflow_delete(id: String) -> Result<(), String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    guard
        .execute("DELETE FROM workflows WHERE id = ?1", params![id])
        .map_err(sql_err)?;
    Ok(())
}

/// Fetch one saved request by id (used by the workflow executor to resolve a
/// `request_ref`). Returns `None` when the id is unknown (dangling ref).
pub(crate) fn get_request(id: &str) -> Result<Option<StoredRequest>, String> {
    let guard = connection()?
        .lock()
        .map_err(|_| "lock poisoned".to_string())?;
    let mut stmt = guard
        .prepare(
            "SELECT id, collection_id, name, method, url, headers_json, query_params_json, \
             body_json, auth_json, options_json, sort_order, docs_md, graphql_json, \
             assertions_json \
             FROM requests WHERE id = ?1",
        )
        .map_err(sql_err)?;
    let mut rows = stmt.query(params![id]).map_err(sql_err)?;
    match rows.next().map_err(sql_err)? {
        Some(row) => Ok(Some(row_to_request(row)?)),
        None => Ok(None),
    }
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
             DELETE FROM snapshots;
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
            assertions: vec![],
        }
    }

    fn sample_response(request_id: &str) -> ResponseData {
        ResponseData {
            request_id: request_id.into(),
            status: 200,
            http_version: "2".into(),
            headers: vec![kv("Content-Type", "application/json")],
            body: "{\"id\":1,\"ts\":\"2026-07-13T00:00:00Z\"}".into(),
            body_is_base64: false,
            body_truncated_at: None,
            size_download_bytes: 12,
            timings: Timings::default(),
            effective_url: "https://example.test".into(),
            redirect_chain: vec![],
            verbose_log: String::new(),
            tls: None,
        }
    }

    fn sample_snapshot(request_id: &str) -> SnapshotRecord {
        SnapshotRecord {
            request_id: request_id.into(),
            baseline: sample_response(request_id),
            scrub_config: ScrubConfig {
                paths: vec!["$.ts".into()],
                auto_timestamps: true,
                auto_uuids: false,
            },
            created_at: "2026-07-13T00:00:00+00:00".into(),
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

    // ---------- assertions (v2 migration) ----------

    #[test]
    fn request_assertions_round_trip() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let mut req = sample_request(&coll.id, Body::None, Auth::None);
        req.assertions = vec![
            Assertion::StatusEquals {
                expected: 200,
                enabled: true,
            },
            Assertion::JsonPathEquals {
                path: "$.data.id".into(),
                expected: "42".into(),
                enabled: false,
            },
            Assertion::HeaderExists {
                name: "content-type".into(),
                enabled: true,
            },
            Assertion::ResponseTimeBelow {
                max_ms: 500.0,
                enabled: true,
            },
        ];
        let stored = upsert_request(req).unwrap();
        let listed = list_requests(Some(coll.id)).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(
            listed[0], stored,
            "assertions preserved incl. order + enabled"
        );
        assert_eq!(listed[0].assertions.len(), 4);
    }

    #[test]
    fn request_empty_assertions_default_to_list() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = sample_request(&coll.id, Body::None, Auth::None);
        let stored = upsert_request(req).unwrap();
        assert!(stored.assertions.is_empty());
        let listed = list_requests(Some(coll.id)).unwrap();
        assert_eq!(listed[0].assertions, Vec::<Assertion>::new());
    }

    #[test]
    fn request_backward_compat_null_assertions_column() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        // Simulate a pre-v2 row: insert raw SQL with assertions_json = NULL.
        {
            let conn = connection().unwrap().lock().unwrap();
            conn.execute(
                "INSERT INTO requests (id, collection_id, name, method, url, headers_json, \
                 query_params_json, body_json, auth_json, options_json, sort_order, docs_md, \
                 graphql_json, assertions_json) \
                 VALUES ('old-1', ?1, 'legacy', 'GET', 'https://x.test', '[]', '[]', \
                 '{\"type\":\"none\"}', '{\"type\":\"none\"}', ?2, 0, NULL, NULL, NULL)",
                params![
                    coll.id,
                    serde_json::to_string(&RequestOptions::default()).unwrap()
                ],
            )
            .unwrap();
        }
        let listed = list_requests(Some(coll.id)).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(
            listed[0].assertions,
            Vec::<Assertion>::new(),
            "NULL column reads as [] without error"
        );
    }

    #[test]
    fn migrate_is_idempotent_and_ends_at_current_version() {
        let _g = setup();
        let conn = connection().unwrap().lock().unwrap();
        // Re-running migrate must not error (the ALTER is guarded by `let _`).
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        let version: i64 = conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(version, 3);
        // The column must exist exactly once (a second ADD would have errored fatally).
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('requests') WHERE name = 'assertions_json'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migrate_v2_to_v3_adds_workflows_and_preserves_existing_rows() {
        let _g = setup();
        let conn = connection().unwrap().lock().unwrap();
        // Pin the shared in-memory DB back to v2 (no workflows table) and seed a
        // pre-existing collection so we can prove the upgrade is non-destructive.
        conn.execute_batch("DROP TABLE IF EXISTS workflows;")
            .unwrap();
        conn.execute("UPDATE schema_version SET version = 2", [])
            .unwrap();
        conn.execute(
            "INSERT INTO collections (id, name, sort_order) VALUES ('c-keep', 'Keep me', 0)",
            [],
        )
        .unwrap();

        migrate(&conn).unwrap();

        let version: i64 = conn
            .query_row("SELECT version FROM schema_version LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(version, 3, "migration bumped the schema version");

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='workflows'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1, "workflows table now exists");

        let kept: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM collections WHERE id = 'c-keep'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1, "pre-existing rows untouched by the v3 migration");
    }

    // ---------- workflows ----------

    fn sample_workflow(name: &str, request_id: &str) -> Workflow {
        Workflow {
            id: String::new(),
            name: name.into(),
            nodes: vec![
                WorkflowNode::Request {
                    id: "n1".into(),
                    source: crate::models::RequestSource::RequestRef(request_id.into()),
                    position: crate::models::NodePosition { x: 10.0, y: 20.0 },
                },
                WorkflowNode::Extract {
                    id: "n2".into(),
                    source: "$.id".into(),
                    var_name: "token".into(),
                    position: crate::models::NodePosition { x: 200.0, y: 20.0 },
                },
                WorkflowNode::Delay {
                    id: "n3".into(),
                    ms: 100,
                    position: crate::models::NodePosition { x: 400.0, y: 20.0 },
                },
            ],
            edges: vec![
                WorkflowEdge {
                    from: "n1".into(),
                    to: "n2".into(),
                    branch: None,
                },
                WorkflowEdge {
                    from: "n2".into(),
                    to: "n3".into(),
                    branch: None,
                },
            ],
        }
    }

    #[test]
    fn workflow_crud_round_trips_graph_and_overwrites_in_place() {
        let _g = setup();
        assert!(workflow_list().unwrap().is_empty(), "no workflows yet");

        let saved = workflow_upsert(sample_workflow("Login flow", "req-x")).unwrap();
        assert!(!saved.id.is_empty(), "store minted an id");

        let listed = workflow_list().unwrap();
        assert_eq!(listed.len(), 1);
        let got = &listed[0];
        assert_eq!(got.name, "Login flow");
        assert_eq!(got.nodes.len(), 3, "nodes round-trip intact");
        assert_eq!(got.edges.len(), 2, "edges round-trip intact");
        assert_eq!(got.nodes, saved.nodes, "node graph is byte-identical");

        // Re-upsert with the SAME id updates in place (no duplicate row).
        let mut renamed = saved.clone();
        renamed.name = "Login flow v2".into();
        renamed.nodes.pop();
        workflow_upsert(renamed).unwrap();
        let after = workflow_list().unwrap();
        assert_eq!(
            after.len(),
            1,
            "still exactly one workflow (updated in place)"
        );
        assert_eq!(after[0].name, "Login flow v2");
        assert_eq!(after[0].nodes.len(), 2, "graph replaced on update");

        workflow_delete(saved.id).unwrap();
        assert!(workflow_list().unwrap().is_empty(), "deleted");
    }

    #[test]
    fn get_request_returns_none_for_unknown_id() {
        let _g = setup();
        assert_eq!(get_request("does-not-exist").unwrap(), None);
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();
        assert_eq!(get_request(&req.id).unwrap().map(|r| r.id), Some(req.id));
    }

    // ---------- snapshots ----------

    #[test]
    fn snapshot_crud_and_overwrite() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();

        assert_eq!(
            snapshot_get(req.id.clone()).unwrap(),
            None,
            "no baseline yet"
        );

        let record = SnapshotRecord {
            request_id: req.id.clone(),
            ..sample_snapshot(&req.id)
        };
        let put = snapshot_put(record.clone()).unwrap();
        assert_eq!(snapshot_get(req.id.clone()).unwrap(), Some(put));

        // A second put for the same request overwrites (Accept semantics).
        let mut accepted = sample_snapshot(&req.id);
        accepted.baseline.status = 201;
        accepted.created_at = "2026-07-13T01:00:00+00:00".into();
        snapshot_put(accepted.clone()).unwrap();
        let got = snapshot_get(req.id.clone()).unwrap().unwrap();
        assert_eq!(got.baseline.status, 201, "new baseline adopted");

        snapshot_delete(req.id.clone()).unwrap();
        assert_eq!(snapshot_get(req.id).unwrap(), None, "deleted");
    }

    #[test]
    fn snapshot_cascades_on_request_delete() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();
        snapshot_put(sample_snapshot(&req.id)).unwrap();
        assert!(snapshot_get(req.id.clone()).unwrap().is_some());
        delete_request(req.id.clone()).unwrap();
        assert_eq!(
            snapshot_get(req.id).unwrap(),
            None,
            "FK ON DELETE CASCADE drops the snapshot"
        );
    }

    #[test]
    fn snapshot_put_defaults_created_at() {
        let _g = setup();
        let coll = upsert_collection(sample_collection("C")).unwrap();
        let req = upsert_request(sample_request(&coll.id, Body::None, Auth::None)).unwrap();
        let mut record = sample_snapshot(&req.id);
        record.created_at = String::new();
        let put = snapshot_put(record).unwrap();
        assert!(
            !put.created_at.is_empty(),
            "empty created_at is stamped with now()"
        );
        // rfc3339 begins with a 4-digit year.
        assert!(put.created_at.chars().take(4).all(|c| c.is_ascii_digit()));
    }
}
