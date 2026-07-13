//! Importers: Postman v2.1, Insomnia v4, HAR, .http/.rest (JetBrains
//! dialect, tolerant), curl commands from ~/.zsh_history.
//!
//! Each importer has a pure `pub(crate)` core that operates on a literal
//! string (JSON text, file text, or history text) so the whole surface is
//! testable offline without touching the real HOME or the network. The
//! `#[tauri::command]` wrappers only adapt inputs/errors and, for the shell
//! scanner, read the user's history files.

use crate::models::{
    ApiKeyPlacement, Auth, Body, Collection, Environment, ImportResult, KeyValue, MultipartPart,
    RequestOptions, StoredRequest,
};
use serde_json::Value;
use uuid::Uuid;

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Extract a JSON string field, tolerating a missing/non-string value.
fn str_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

// ---------------------------------------------------------------------------
// Postman collection v2.1
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_postman(json: String) -> Result<ImportResult, String> {
    let root: Value = serde_json::from_str(&json).map_err(|e| format!("invalid JSON: {e}"))?;
    Ok(parse_postman(&root))
}

pub(crate) fn parse_postman(root: &Value) -> ImportResult {
    let mut result = ImportResult::default();

    // The top-level collection becomes the root Collection; its items nest
    // under it. Postman stores the collection name in `info.name`.
    let root_name = root
        .get("info")
        .and_then(|info| str_field(info, "name"))
        .unwrap_or_else(|| "Imported collection".to_string());
    let root_collection_id = new_id();
    result.collections.push(Collection {
        id: root_collection_id.clone(),
        name: root_name,
        parent_id: None,
        sort_order: 0,
        docs_md: None,
    });

    if let Some(items) = root.get("item").and_then(Value::as_array) {
        walk_postman_items(items, &root_collection_id, &mut result);
    }

    // Environments and globals import as flat Environments.
    for env_key in ["environment", "globals"] {
        if let Some(env_value) = root.get(env_key) {
            if let Some(env) = parse_postman_environment(env_value, env_key) {
                result.environments.push(env);
            }
        }
    }

    result
}

fn walk_postman_items(items: &[Value], parent_id: &str, result: &mut ImportResult) {
    for (index, item) in items.iter().enumerate() {
        let sort_order = index as i64;
        if item.get("item").and_then(Value::as_array).is_some() {
            // A folder: becomes a nested Collection.
            let folder_id = new_id();
            result.collections.push(Collection {
                id: folder_id.clone(),
                name: str_field(item, "name").unwrap_or_else(|| "Folder".to_string()),
                parent_id: Some(parent_id.to_string()),
                sort_order,
                docs_md: str_field(item, "description"),
            });
            if let Some(children) = item.get("item").and_then(Value::as_array) {
                walk_postman_items(children, &folder_id, result);
            }
        } else if item.get("request").is_some() {
            let request = parse_postman_request(item, parent_id, sort_order, result);
            result.requests.push(request);
        }
    }
}

fn parse_postman_request(
    item: &Value,
    collection_id: &str,
    sort_order: i64,
    result: &mut ImportResult,
) -> StoredRequest {
    let name = str_field(item, "name").unwrap_or_else(|| "Request".to_string());
    let request = item.get("request").unwrap_or(&Value::Null);

    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET")
        .to_uppercase();

    let url = parse_postman_url(request.get("url"));
    let query_params = parse_postman_query(request.get("url"));
    let headers = parse_postman_headers(request.get("header"));
    let body = parse_postman_body(request.get("body"));
    let auth = parse_postman_auth(request.get("auth"));

    // Pre-request / test scripts are NOT translated. Warn per request.
    if postman_has_scripts(item) {
        result.warnings.push(format!(
            "Postman request '{name}' has pre-request/test scripts (pm.*) that were NOT translated"
        ));
    }

    StoredRequest {
        id: new_id(),
        collection_id: collection_id.to_string(),
        name,
        method,
        url,
        headers,
        query_params,
        body,
        auth,
        options: RequestOptions::default(),
        sort_order,
        docs_md: str_field(request, "description"),
        graphql: None,
        assertions: vec![],
    }
}

fn postman_has_scripts(item: &Value) -> bool {
    item.get("event")
        .and_then(Value::as_array)
        .map(|events| {
            events.iter().any(|event| {
                event
                    .get("script")
                    .and_then(|script| script.get("exec"))
                    .map(|exec| match exec {
                        Value::Array(lines) => lines.iter().any(|line| {
                            line.as_str().map(|s| !s.trim().is_empty()).unwrap_or(false)
                        }),
                        Value::String(text) => !text.trim().is_empty(),
                        _ => false,
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Postman `url` is either a raw string or an object with `raw`/`host`/`path`.
fn parse_postman_url(url: Option<&Value>) -> String {
    match url {
        Some(Value::String(raw)) => strip_query(raw),
        Some(Value::Object(_)) => {
            let url = url.unwrap();
            if let Some(raw) = str_field(url, "raw") {
                return strip_query(&raw);
            }
            let protocol = str_field(url, "protocol").unwrap_or_else(|| "https".to_string());
            let host = url
                .get("host")
                .map(join_postman_segments_dot)
                .unwrap_or_default();
            let path = url
                .get("path")
                .map(join_postman_segments_slash)
                .unwrap_or_default();
            if host.is_empty() {
                path
            } else if path.is_empty() {
                format!("{protocol}://{host}")
            } else {
                format!("{protocol}://{host}/{path}")
            }
        }
        _ => String::new(),
    }
}

fn strip_query(raw: &str) -> String {
    raw.split('?').next().unwrap_or(raw).to_string()
}

/// Host segments join with `.`; a segment may itself be a string or {{var}}.
fn join_postman_segments_dot(value: &Value) -> String {
    match value {
        Value::Array(parts) => parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("."),
        Value::String(s) => s.clone(),
        _ => String::new(),
    }
}

/// Path segments join with `/`.
fn join_postman_segments_slash(value: &Value) -> String {
    match value {
        Value::Array(parts) => parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("/"),
        Value::String(s) => s.trim_start_matches('/').to_string(),
        _ => String::new(),
    }
}

fn parse_postman_query(url: Option<&Value>) -> Vec<KeyValue> {
    let Some(Value::Object(_)) = url else {
        return Vec::new();
    };
    url.unwrap()
        .get("query")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: str_field(entry, "key").unwrap_or_default(),
                    value: str_field(entry, "value").unwrap_or_default(),
                    enabled: !entry
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_postman_headers(header: Option<&Value>) -> Vec<KeyValue> {
    header
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: str_field(entry, "key").unwrap_or_default(),
                    value: str_field(entry, "value").unwrap_or_default(),
                    enabled: !entry
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_postman_body(body: Option<&Value>) -> Body {
    let Some(body) = body else {
        return Body::None;
    };
    let mode = body.get("mode").and_then(Value::as_str).unwrap_or("");
    match mode {
        "raw" => {
            let text = str_field(body, "raw").unwrap_or_default();
            let content_type = body
                .get("options")
                .and_then(|opts| opts.get("raw"))
                .and_then(|raw| str_field(raw, "language"))
                .map(postman_language_to_content_type)
                .unwrap_or_else(|| "text/plain".to_string());
            Body::Raw { content_type, text }
        }
        "urlencoded" => Body::FormUrlencoded {
            fields: parse_postman_kv_body(body.get("urlencoded")),
        },
        "formdata" => Body::Multipart {
            parts: parse_postman_formdata(body.get("formdata")),
        },
        _ => Body::None,
    }
}

fn postman_language_to_content_type(language: String) -> String {
    match language.as_str() {
        "json" => "application/json".to_string(),
        "xml" => "application/xml".to_string(),
        "html" => "text/html".to_string(),
        "javascript" => "application/javascript".to_string(),
        _ => "text/plain".to_string(),
    }
}

fn parse_postman_kv_body(field: Option<&Value>) -> Vec<KeyValue> {
    field
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: str_field(entry, "key").unwrap_or_default(),
                    value: str_field(entry, "value").unwrap_or_default(),
                    enabled: !entry
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_postman_formdata(formdata: Option<&Value>) -> Vec<MultipartPart> {
    formdata
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| {
                    let name = str_field(entry, "key").unwrap_or_default();
                    let kind = entry.get("type").and_then(Value::as_str).unwrap_or("text");
                    if kind == "file" {
                        MultipartPart::File {
                            name,
                            path: str_field(entry, "src").unwrap_or_default(),
                            content_type: str_field(entry, "contentType"),
                        }
                    } else {
                        MultipartPart::Text {
                            name,
                            value: str_field(entry, "value").unwrap_or_default(),
                        }
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_postman_auth(auth: Option<&Value>) -> Auth {
    let Some(auth) = auth else {
        return Auth::None;
    };
    let auth_type = auth.get("type").and_then(Value::as_str).unwrap_or("");
    match auth_type {
        "bearer" => Auth::Bearer {
            token: postman_auth_param(auth, "bearer", "token").unwrap_or_default(),
        },
        "basic" => Auth::Basic {
            username: postman_auth_param(auth, "basic", "username").unwrap_or_default(),
            password: postman_auth_param(auth, "basic", "password").unwrap_or_default(),
        },
        "apikey" => {
            let placement = postman_auth_param(auth, "apikey", "in")
                .map(|value| {
                    if value.eq_ignore_ascii_case("query") {
                        ApiKeyPlacement::Query
                    } else {
                        ApiKeyPlacement::Header
                    }
                })
                .unwrap_or(ApiKeyPlacement::Header);
            Auth::ApiKey {
                name: postman_auth_param(auth, "apikey", "key").unwrap_or_default(),
                value: postman_auth_param(auth, "apikey", "value").unwrap_or_default(),
                placement,
            }
        }
        _ => Auth::None,
    }
}

/// Postman auth params live under `auth.<scheme>` as either an array of
/// `{key,value}` entries or a flat object.
fn postman_auth_param(auth: &Value, scheme: &str, key: &str) -> Option<String> {
    let scheme_value = auth.get(scheme)?;
    match scheme_value {
        Value::Array(entries) => entries
            .iter()
            .find(|entry| str_field(entry, "key").as_deref() == Some(key))
            .and_then(|entry| str_field(entry, "value")),
        Value::Object(_) => str_field(scheme_value, key),
        _ => None,
    }
}

fn parse_postman_environment(env: &Value, fallback_name: &str) -> Option<Environment> {
    let values = env.get("values").and_then(Value::as_array)?;
    let variables = values
        .iter()
        .map(|entry| KeyValue {
            name: str_field(entry, "key").unwrap_or_default(),
            value: str_field(entry, "value").unwrap_or_default(),
            enabled: entry
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        })
        .collect();
    Some(Environment {
        id: new_id(),
        name: str_field(env, "name").unwrap_or_else(|| fallback_name.to_string()),
        parent_id: None,
        color: None,
        variables,
        secret_names: Vec::new(),
    })
}

// ---------------------------------------------------------------------------
// Insomnia export v4
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_insomnia(json: String) -> Result<ImportResult, String> {
    let root: Value = serde_json::from_str(&json).map_err(|e| format!("invalid JSON: {e}"))?;
    Ok(parse_insomnia(&root))
}

pub(crate) fn parse_insomnia(root: &Value) -> ImportResult {
    let mut result = ImportResult::default();
    let resources = match root.get("resources").and_then(Value::as_array) {
        Some(resources) => resources,
        None => return result,
    };

    let mut warned_template_tags = false;

    for (index, resource) in resources.iter().enumerate() {
        let sort_order = index as i64;
        match resource.get("_type").and_then(Value::as_str) {
            Some("request_group") => {
                result.collections.push(Collection {
                    id: str_field(resource, "_id").unwrap_or_else(new_id),
                    name: str_field(resource, "name").unwrap_or_else(|| "Folder".to_string()),
                    parent_id: str_field(resource, "parentId"),
                    sort_order,
                    docs_md: str_field(resource, "description"),
                });
            }
            Some("request") => {
                let request =
                    parse_insomnia_request(resource, sort_order, &mut warned_template_tags);
                result.requests.push(request);
                if insomnia_has_template_tags(resource) && !warned_template_tags {
                    // A template tag other than the simple `{{ _.var }}` form
                    // was found; flag it once for the whole import.
                    warned_template_tags = true;
                    result.warnings.push(
                        "Insomnia template tags (e.g. {% ... %} / response chaining) were found and left verbatim — they are not translated"
                            .to_string(),
                    );
                }
            }
            Some("environment") => {
                if let Some(env) = parse_insomnia_environment(resource) {
                    result.environments.push(env);
                }
            }
            _ => {}
        }
    }

    result
}

fn parse_insomnia_request(resource: &Value, sort_order: i64, _warned: &mut bool) -> StoredRequest {
    let url = convert_insomnia_tags(&str_field(resource, "url").unwrap_or_default());
    let method = resource
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET")
        .to_uppercase();

    let headers = resource
        .get("headers")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: convert_insomnia_tags(&str_field(entry, "name").unwrap_or_default()),
                    value: convert_insomnia_tags(&str_field(entry, "value").unwrap_or_default()),
                    enabled: !entry
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();

    let query_params = resource
        .get("parameters")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: convert_insomnia_tags(&str_field(entry, "name").unwrap_or_default()),
                    value: convert_insomnia_tags(&str_field(entry, "value").unwrap_or_default()),
                    enabled: !entry
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();

    let body = parse_insomnia_body(resource.get("body"));
    let auth = parse_insomnia_auth(resource.get("authentication"));

    StoredRequest {
        id: str_field(resource, "_id").unwrap_or_else(new_id),
        collection_id: str_field(resource, "parentId").unwrap_or_default(),
        name: str_field(resource, "name").unwrap_or_else(|| "Request".to_string()),
        method,
        url,
        headers,
        query_params,
        body,
        auth,
        options: RequestOptions::default(),
        sort_order,
        docs_md: str_field(resource, "description"),
        graphql: None,
        assertions: vec![],
    }
}

fn parse_insomnia_body(body: Option<&Value>) -> Body {
    let Some(body) = body else {
        return Body::None;
    };
    let mime = body.get("mimeType").and_then(Value::as_str).unwrap_or("");
    if mime == "application/x-www-form-urlencoded" {
        return Body::FormUrlencoded {
            fields: body
                .get("params")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|entry| KeyValue {
                            name: convert_insomnia_tags(
                                &str_field(entry, "name").unwrap_or_default(),
                            ),
                            value: convert_insomnia_tags(
                                &str_field(entry, "value").unwrap_or_default(),
                            ),
                            enabled: !entry
                                .get("disabled")
                                .and_then(Value::as_bool)
                                .unwrap_or(false),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        };
    }
    if mime == "multipart/form-data" {
        return Body::Multipart {
            parts: body
                .get("params")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|entry| {
                            let name = convert_insomnia_tags(
                                &str_field(entry, "name").unwrap_or_default(),
                            );
                            match str_field(entry, "fileName") {
                                Some(path) if !path.is_empty() => MultipartPart::File {
                                    name,
                                    path,
                                    content_type: str_field(entry, "type"),
                                },
                                _ => MultipartPart::Text {
                                    name,
                                    value: convert_insomnia_tags(
                                        &str_field(entry, "value").unwrap_or_default(),
                                    ),
                                },
                            }
                        })
                        .collect()
                })
                .unwrap_or_default(),
        };
    }
    match str_field(body, "text") {
        Some(text) if !text.is_empty() => Body::Raw {
            content_type: if mime.is_empty() {
                "text/plain".to_string()
            } else {
                mime.to_string()
            },
            text: convert_insomnia_tags(&text),
        },
        _ => Body::None,
    }
}

fn parse_insomnia_auth(auth: Option<&Value>) -> Auth {
    let Some(auth) = auth else {
        return Auth::None;
    };
    match auth.get("type").and_then(Value::as_str) {
        Some("bearer") => Auth::Bearer {
            token: convert_insomnia_tags(&str_field(auth, "token").unwrap_or_default()),
        },
        Some("basic") => Auth::Basic {
            username: convert_insomnia_tags(&str_field(auth, "username").unwrap_or_default()),
            password: convert_insomnia_tags(&str_field(auth, "password").unwrap_or_default()),
        },
        Some("apikey") => {
            let placement = str_field(auth, "addTo")
                .map(|value| {
                    if value.eq_ignore_ascii_case("queryParams")
                        || value.eq_ignore_ascii_case("query")
                    {
                        ApiKeyPlacement::Query
                    } else {
                        ApiKeyPlacement::Header
                    }
                })
                .unwrap_or(ApiKeyPlacement::Header);
            Auth::ApiKey {
                name: convert_insomnia_tags(&str_field(auth, "key").unwrap_or_default()),
                value: convert_insomnia_tags(&str_field(auth, "value").unwrap_or_default()),
                placement,
            }
        }
        _ => Auth::None,
    }
}

fn parse_insomnia_environment(resource: &Value) -> Option<Environment> {
    let data = resource.get("data").and_then(Value::as_object)?;
    let variables = data
        .iter()
        .map(|(key, value)| KeyValue {
            name: key.clone(),
            value: convert_insomnia_tags(&json_scalar_to_string(value)),
            enabled: true,
        })
        .collect();
    Some(Environment {
        id: str_field(resource, "_id").unwrap_or_else(new_id),
        name: str_field(resource, "name").unwrap_or_else(|| "Environment".to_string()),
        parent_id: str_field(resource, "parentId"),
        color: str_field(resource, "color"),
        variables,
        secret_names: Vec::new(),
    })
}

fn json_scalar_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Convert Insomnia's simple `{{ _.var }}` template into our `{{env.var}}`.
/// Only the plain-variable form is rewritten; anything else is left as-is.
pub(crate) fn convert_insomnia_tags(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            if let Some(close) = input[i + 2..].find("}}") {
                let inner = &input[i + 2..i + 2 + close];
                if let Some(var) = parse_insomnia_dot_var(inner) {
                    output.push_str("{{env.");
                    output.push_str(&var);
                    output.push_str("}}");
                    i = i + 2 + close + 2;
                    continue;
                }
                // Not the plain form; keep the whole tag verbatim.
                output.push_str(&input[i..i + 2 + close + 2]);
                i = i + 2 + close + 2;
                continue;
            }
        }
        // Push one UTF-8 char to avoid slicing mid-codepoint.
        let ch_len = utf8_char_len(bytes[i]);
        output.push_str(&input[i..i + ch_len]);
        i += ch_len;
    }
    output
}

/// Accept the `_.name` form (optionally spaced) and return `name`.
fn parse_insomnia_dot_var(inner: &str) -> Option<String> {
    let trimmed = inner.trim();
    let rest = trimmed.strip_prefix("_.")?;
    if rest.is_empty()
        || !rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return None;
    }
    Some(rest.to_string())
}

fn utf8_char_len(first_byte: u8) -> usize {
    match first_byte {
        b if b < 0x80 => 1,
        b if b >> 5 == 0b110 => 2,
        b if b >> 4 == 0b1110 => 3,
        _ => 4,
    }
}

fn insomnia_has_template_tags(resource: &Value) -> bool {
    // A raw scan for `{%` anywhere in the request's serialized text signals a
    // non-trivial template tag (function, response chaining, etc.).
    resource.to_string().contains("{%")
}

// ---------------------------------------------------------------------------
// HAR
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_har(json: String) -> Result<ImportResult, String> {
    let root: Value = serde_json::from_str(&json).map_err(|e| format!("invalid JSON: {e}"))?;
    Ok(parse_har(&root))
}

pub(crate) fn parse_har(root: &Value) -> ImportResult {
    let mut result = ImportResult::default();
    let entries = match root
        .get("log")
        .and_then(|log| log.get("entries"))
        .and_then(Value::as_array)
    {
        Some(entries) => entries,
        None => return result,
    };

    let mut skipped_assets = 0usize;
    let mut secret_hosts: Vec<String> = Vec::new();
    // Collection per host, created lazily and reused.
    let mut host_collections: Vec<(String, String)> = Vec::new();

    for entry in entries {
        let request = match entry.get("request") {
            Some(request) => request,
            None => continue,
        };
        let url = str_field(request, "url").unwrap_or_default();

        // Denoise: skip responses that are images/css/fonts/scripts.
        if let Some(mime) = har_response_mime(entry) {
            if is_asset_mime(&mime) {
                skipped_assets += 1;
                continue;
            }
        }

        let host = host_of(&url);
        let collection_id = ensure_host_collection(&host, &mut host_collections, &mut result);

        let headers = parse_har_headers(request.get("headers"));
        if har_has_secret_header(&headers) && !secret_hosts.contains(&host) {
            secret_hosts.push(host.clone());
        }

        let query_params = parse_har_query(request.get("queryString"));
        let body = parse_har_body(request.get("postData"));
        let sort_order = result.requests.len() as i64;

        result.requests.push(StoredRequest {
            id: new_id(),
            collection_id,
            name: har_request_name(request, &url),
            method: request
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or("GET")
                .to_uppercase(),
            url: strip_query(&url),
            headers,
            query_params,
            body,
            auth: Auth::None,
            options: RequestOptions::default(),
            sort_order,
            docs_md: None,
            graphql: None,
            assertions: vec![],
        });
    }

    if skipped_assets > 0 {
        result.warnings.push(format!(
            "Skipped {skipped_assets} static asset request(s) (image/css/font/script) while denoising the HAR"
        ));
    }
    for host in secret_hosts {
        result.warnings.push(format!(
            "Detected a secret (Authorization/Cookie header) on host '{host}' — consider moving it to an environment variable"
        ));
    }

    result
}

fn har_response_mime(entry: &Value) -> Option<String> {
    entry
        .get("response")
        .and_then(|response| response.get("content"))
        .and_then(|content| str_field(content, "mimeType"))
}

fn is_asset_mime(mime: &str) -> bool {
    let mime = mime.split(';').next().unwrap_or(mime).trim().to_lowercase();
    mime.starts_with("image/")
        || mime.starts_with("font/")
        || mime == "text/css"
        || mime == "application/font-woff"
        || mime == "application/font-woff2"
        || mime == "text/javascript"
        || mime == "application/javascript"
        || mime == "application/x-javascript"
}

fn har_request_name(request: &Value, url: &str) -> String {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET");
    let path = url
        .splitn(4, '/')
        .nth(3)
        .map(|p| format!("/{}", p.split('?').next().unwrap_or(p)))
        .unwrap_or_else(|| "/".to_string());
    format!("{method} {path}")
}

fn parse_har_headers(headers: Option<&Value>) -> Vec<KeyValue> {
    headers
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: str_field(entry, "name").unwrap_or_default(),
                    value: str_field(entry, "value").unwrap_or_default(),
                    enabled: true,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_har_query(query: Option<&Value>) -> Vec<KeyValue> {
    query
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|entry| KeyValue {
                    name: str_field(entry, "name").unwrap_or_default(),
                    value: str_field(entry, "value").unwrap_or_default(),
                    enabled: true,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_har_body(post_data: Option<&Value>) -> Body {
    let Some(post_data) = post_data else {
        return Body::None;
    };
    let mime = str_field(post_data, "mimeType").unwrap_or_default();
    let base_mime = mime.split(';').next().unwrap_or(&mime).trim().to_string();

    if base_mime == "application/x-www-form-urlencoded" {
        if let Some(params) = post_data.get("params").and_then(Value::as_array) {
            return Body::FormUrlencoded {
                fields: params
                    .iter()
                    .map(|entry| KeyValue {
                        name: str_field(entry, "name").unwrap_or_default(),
                        value: str_field(entry, "value").unwrap_or_default(),
                        enabled: true,
                    })
                    .collect(),
            };
        }
    }

    match str_field(post_data, "text") {
        Some(text) if !text.is_empty() => Body::Raw {
            content_type: if base_mime.is_empty() {
                "text/plain".to_string()
            } else {
                base_mime
            },
            text,
        },
        _ => Body::None,
    }
}

fn har_has_secret_header(headers: &[KeyValue]) -> bool {
    headers.iter().any(|header| {
        let name = header.name.to_ascii_lowercase();
        name == "authorization" || name == "cookie"
    })
}

fn ensure_host_collection(
    host: &str,
    host_collections: &mut Vec<(String, String)>,
    result: &mut ImportResult,
) -> String {
    if let Some((_, id)) = host_collections.iter().find(|(h, _)| h == host) {
        return id.clone();
    }
    let id = new_id();
    result.collections.push(Collection {
        id: id.clone(),
        name: if host.is_empty() {
            "HAR".to_string()
        } else {
            host.to_string()
        },
        parent_id: None,
        sort_order: host_collections.len() as i64,
        docs_md: None,
    });
    host_collections.push((host.to_string(), id.clone()));
    id
}

fn host_of(url: &str) -> String {
    let without_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or(url);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .to_string()
}

// ---------------------------------------------------------------------------
// .http / .rest files (JetBrains HTTP client dialect, tolerant)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_http_file(text: String) -> Result<ImportResult, String> {
    Ok(parse_http_file(&text))
}

pub(crate) fn parse_http_file(text: &str) -> ImportResult {
    let mut result = ImportResult::default();
    let collection_id = new_id();
    result.collections.push(Collection {
        id: collection_id.clone(),
        name: "Imported .http".to_string(),
        parent_id: None,
        sort_order: 0,
        docs_md: None,
    });

    let mut sort_order = 0i64;
    for block in split_http_blocks(text) {
        if let Some(request) = parse_http_block(&block, &collection_id, sort_order) {
            result.requests.push(request);
            sort_order += 1;
        }
    }

    result
}

/// Split on `###` separators; each block is one request.
fn split_http_blocks(text: &str) -> Vec<String> {
    let mut blocks: Vec<String> = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        if line.trim_start().starts_with("###") {
            if !current.trim().is_empty() {
                blocks.push(std::mem::take(&mut current));
            } else {
                current.clear();
            }
            continue;
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        blocks.push(current);
    }
    blocks
}

fn parse_http_block(block: &str, collection_id: &str, sort_order: i64) -> Option<StoredRequest> {
    let mut name: Option<String> = None;
    let mut method: Option<String> = None;
    let mut url = String::new();
    let mut headers: Vec<KeyValue> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();

    let mut in_body = false;
    let mut seen_request_line = false;

    for raw_line in block.lines() {
        let line = raw_line;

        if in_body {
            body_lines.push(line.to_string());
            continue;
        }

        let trimmed = line.trim();

        // Comments: `#`, `//`. VS Code REST Client `@name`/`# @name` metadata.
        if !seen_request_line {
            if let Some(named) = parse_http_name_comment(trimmed) {
                name = Some(named);
                continue;
            }
            if trimmed.is_empty() || is_http_comment(trimmed) {
                continue;
            }
            // First non-comment line is the request line: METHOD URL or URL.
            let (parsed_method, parsed_url) = parse_http_request_line(trimmed);
            method = Some(parsed_method);
            url = parsed_url;
            seen_request_line = true;
            continue;
        }

        // After the request line: headers until a blank line, then body.
        if trimmed.is_empty() {
            in_body = true;
            continue;
        }
        if is_http_comment(trimmed) {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            headers.push(KeyValue {
                name: key.trim().to_string(),
                value: value.trim().to_string(),
                enabled: true,
            });
        }
    }

    if !seen_request_line {
        return None;
    }

    let body_text = body_lines.join("\n");
    let body = build_http_body(&headers, body_text.trim_end_matches('\n'));
    let request_name = name.unwrap_or_else(|| {
        let method_str = method.clone().unwrap_or_else(|| "GET".to_string());
        format!("{method_str} {url}")
    });

    Some(StoredRequest {
        id: new_id(),
        collection_id: collection_id.to_string(),
        name: request_name,
        method: method.unwrap_or_else(|| "GET".to_string()),
        url,
        headers,
        query_params: Vec::new(),
        body,
        auth: Auth::None,
        options: RequestOptions::default(),
        sort_order,
        docs_md: None,
        graphql: None,
        assertions: vec![],
    })
}

fn is_http_comment(trimmed: &str) -> bool {
    trimmed.starts_with('#') || trimmed.starts_with("//")
}

/// `# @name foo`, `// @name foo` or `@name foo` -> Some("foo").
fn parse_http_name_comment(trimmed: &str) -> Option<String> {
    let rest = trimmed
        .strip_prefix("# @name")
        .or_else(|| trimmed.strip_prefix("// @name"))
        .or_else(|| trimmed.strip_prefix("@name"))?;
    let value = rest.trim_start_matches('=').trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

/// A request line is `METHOD URL` or a bare `URL` (defaults to GET).
fn parse_http_request_line(line: &str) -> (String, String) {
    let mut parts = line.split_whitespace();
    let first = parts.next().unwrap_or("");
    if is_http_method(first) {
        // Drop a trailing HTTP-version token if present.
        let url = parts.next().unwrap_or("").to_string();
        (first.to_uppercase(), url)
    } else {
        (String::from("GET"), first.to_string())
    }
}

fn is_http_method(token: &str) -> bool {
    matches!(
        token.to_uppercase().as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE" | "CONNECT"
    )
}

fn build_http_body(headers: &[KeyValue], body_text: &str) -> Body {
    if body_text.trim().is_empty() {
        return Body::None;
    }
    let content_type = headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("content-type"))
        .map(|header| header.value.clone())
        .unwrap_or_else(|| "text/plain".to_string());
    Body::Raw {
        content_type,
        text: body_text.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Shell history scan for curl commands
// ---------------------------------------------------------------------------

/// Scan ~/.zsh_history (and ~/.bash_history) for curl invocations and return
/// the raw commands, newest first, deduplicated.
#[tauri::command]
pub fn scan_shell_history_curls(limit: Option<u32>) -> Result<Vec<String>, String> {
    let home = dirs::home_dir().ok_or("cannot resolve home directory")?;
    let mut combined = String::new();
    for file in [".zsh_history", ".bash_history"] {
        let path = home.join(file);
        if let Ok(contents) = std::fs::read_to_string(&path) {
            combined.push_str(&contents);
            combined.push('\n');
        }
    }
    let limit = limit.map(|n| n as usize);
    Ok(extract_curls_from_history(&combined, limit))
}

/// Core of the shell scanner over a literal history blob (offline-testable).
/// zsh extended-history lines look like `: <ts>:<dur>;<cmd>` — the prefix is
/// stripped. bash lines are the raw command. Only curl lines survive; the
/// result is deduplicated with newest-first ordering.
pub(crate) fn extract_curls_from_history(history: &str, limit: Option<usize>) -> Vec<String> {
    let mut curls: Vec<String> = Vec::new();
    for line in history.lines() {
        let command = strip_zsh_history_prefix(line).trim();
        if command.is_empty() || !is_curl_command(command) {
            continue;
        }
        curls.push(command.to_string());
    }

    // Newest first: history is oldest-to-newest on disk, so reverse.
    curls.reverse();

    // Dedup keeping the first (newest) occurrence.
    let mut seen: Vec<String> = Vec::new();
    let mut deduped: Vec<String> = Vec::new();
    for command in curls {
        if seen.contains(&command) {
            continue;
        }
        seen.push(command.clone());
        deduped.push(command);
    }

    if let Some(limit) = limit {
        deduped.truncate(limit);
    }
    deduped
}

/// Strip the zsh extended-history prefix `: <ts>:<dur>;` if present.
fn strip_zsh_history_prefix(line: &str) -> &str {
    if let Some(rest) = line.strip_prefix(": ") {
        if let Some((meta, command)) = rest.split_once(';') {
            // meta must look like `<digits>:<digits>` for us to treat it as a
            // history prefix; otherwise the `;` belonged to the command.
            if meta
                .split_once(':')
                .map(|(ts, dur)| {
                    !ts.is_empty()
                        && ts.chars().all(|c| c.is_ascii_digit())
                        && dur.chars().all(|c| c.is_ascii_digit())
                })
                .unwrap_or(false)
            {
                return command;
            }
        }
    }
    line
}

/// True when the command runs curl (possibly after env assignments or a
/// leading `sudo`).
fn is_curl_command(command: &str) -> bool {
    for token in command.split_whitespace() {
        if token.contains('=') && !token.starts_with("curl") {
            // Leading VAR=value assignment — skip.
            continue;
        }
        if token == "sudo" {
            continue;
        }
        return token == "curl" || token.ends_with("/curl");
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------- Postman ----------------

    #[test]
    fn postman_folder_two_requests_and_script_warning() {
        let json = r#"{
            "info": { "name": "My API", "schema": "v2.1.0" },
            "item": [
                {
                    "name": "Users",
                    "item": [
                        {
                            "name": "List users",
                            "request": {
                                "method": "GET",
                                "url": {
                                    "raw": "https://api.example.com/users?page=1",
                                    "protocol": "https",
                                    "host": ["api", "example", "com"],
                                    "path": ["users"],
                                    "query": [{ "key": "page", "value": "1" }]
                                },
                                "header": [{ "key": "Accept", "value": "application/json" }],
                                "auth": {
                                    "type": "bearer",
                                    "bearer": [{ "key": "token", "value": "{{token}}" }]
                                }
                            },
                            "event": [
                                {
                                    "listen": "test",
                                    "script": { "exec": ["pm.test('ok', () => {});"] }
                                }
                            ]
                        },
                        {
                            "name": "Create user",
                            "request": {
                                "method": "POST",
                                "url": { "raw": "https://api.example.com/users" },
                                "body": {
                                    "mode": "raw",
                                    "raw": "{\"name\":\"{{name}}\"}",
                                    "options": { "raw": { "language": "json" } }
                                }
                            }
                        }
                    ]
                }
            ],
            "environment": {
                "name": "Prod",
                "values": [{ "key": "token", "value": "abc", "enabled": true }]
            }
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_postman(&root);

        // Root collection + one folder.
        assert_eq!(result.collections.len(), 2);
        assert_eq!(result.collections[0].name, "My API");
        assert!(result.collections[0].parent_id.is_none());
        let folder = &result.collections[1];
        assert_eq!(folder.name, "Users");
        assert_eq!(
            folder.parent_id.as_deref(),
            Some(result.collections[0].id.as_str())
        );

        // Two requests, both under the folder.
        assert_eq!(result.requests.len(), 2);
        let list = &result.requests[0];
        assert_eq!(list.name, "List users");
        assert_eq!(list.method, "GET");
        assert_eq!(list.url, "https://api.example.com/users");
        assert_eq!(list.collection_id, folder.id);
        assert_eq!(list.query_params.len(), 1);
        assert_eq!(list.query_params[0].name, "page");
        // {{var}} preserved verbatim in bearer token.
        match &list.auth {
            Auth::Bearer { token } => assert_eq!(token, "{{token}}"),
            other => panic!("expected bearer auth, got {other:?}"),
        }

        let create = &result.requests[1];
        assert_eq!(create.method, "POST");
        match &create.body {
            Body::Raw { content_type, text } => {
                assert_eq!(content_type, "application/json");
                // {{name}} preserved.
                assert!(text.contains("{{name}}"));
            }
            other => panic!("expected raw body, got {other:?}"),
        }

        // Exactly one script warning (for the List request).
        assert_eq!(
            result
                .warnings
                .iter()
                .filter(|w| w.contains("scripts"))
                .count(),
            1
        );

        // Environment imported.
        assert_eq!(result.environments.len(), 1);
        assert_eq!(result.environments[0].name, "Prod");
        assert_eq!(result.environments[0].variables[0].name, "token");
    }

    #[test]
    fn postman_url_from_host_and_path_segments() {
        let json = r#"{
            "info": { "name": "C" },
            "item": [{
                "name": "R",
                "request": {
                    "method": "get",
                    "url": {
                        "protocol": "https",
                        "host": ["{{base}}", "example", "com"],
                        "path": ["v1", "things"]
                    }
                }
            }]
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_postman(&root);
        assert_eq!(
            result.requests[0].url,
            "https://{{base}}.example.com/v1/things"
        );
        assert_eq!(result.requests[0].method, "GET");
    }

    #[test]
    fn postman_urlencoded_and_formdata_and_apikey() {
        let json = r#"{
            "info": { "name": "C" },
            "item": [
                {
                    "name": "form",
                    "request": {
                        "method": "POST",
                        "url": { "raw": "https://x/y" },
                        "body": {
                            "mode": "urlencoded",
                            "urlencoded": [{ "key": "a", "value": "1" }]
                        },
                        "auth": {
                            "type": "apikey",
                            "apikey": [
                                { "key": "key", "value": "X-Api-Key" },
                                { "key": "value", "value": "secret" },
                                { "key": "in", "value": "header" }
                            ]
                        }
                    }
                },
                {
                    "name": "multi",
                    "request": {
                        "method": "POST",
                        "url": { "raw": "https://x/z" },
                        "body": {
                            "mode": "formdata",
                            "formdata": [
                                { "key": "field", "value": "v", "type": "text" },
                                { "key": "file", "src": "/tmp/a.png", "type": "file", "contentType": "image/png" }
                            ]
                        }
                    }
                }
            ]
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_postman(&root);

        match &result.requests[0].body {
            Body::FormUrlencoded { fields } => {
                assert_eq!(fields[0].name, "a");
                assert_eq!(fields[0].value, "1");
            }
            other => panic!("expected urlencoded, got {other:?}"),
        }
        match &result.requests[0].auth {
            Auth::ApiKey {
                name,
                value,
                placement,
            } => {
                assert_eq!(name, "X-Api-Key");
                assert_eq!(value, "secret");
                assert_eq!(*placement, ApiKeyPlacement::Header);
            }
            other => panic!("expected apikey auth, got {other:?}"),
        }
        match &result.requests[1].body {
            Body::Multipart { parts } => {
                assert_eq!(parts.len(), 2);
                assert!(
                    matches!(&parts[0], MultipartPart::Text { name, value } if name == "field" && value == "v")
                );
                assert!(
                    matches!(&parts[1], MultipartPart::File { name, path, content_type }
                    if name == "file" && path == "/tmp/a.png" && content_type.as_deref() == Some("image/png"))
                );
            }
            other => panic!("expected multipart, got {other:?}"),
        }
    }

    // ---------------- Insomnia ----------------

    #[test]
    fn insomnia_group_request_env_and_tag_rewrite() {
        let json = r#"{
            "_type": "export",
            "__export_format": 4,
            "resources": [
                {
                    "_id": "grp_1",
                    "_type": "request_group",
                    "name": "Folder",
                    "parentId": null
                },
                {
                    "_id": "req_1",
                    "_type": "request",
                    "parentId": "grp_1",
                    "name": "Get",
                    "method": "get",
                    "url": "https://api.test/{{ _.path }}",
                    "headers": [{ "name": "Authorization", "value": "Bearer {{ _.token }}" }],
                    "body": { "mimeType": "application/json", "text": "{\"x\": \"{{ _.x }}\"}" },
                    "authentication": { "type": "bearer", "token": "{{ _.token }}" }
                },
                {
                    "_id": "env_1",
                    "_type": "environment",
                    "name": "Base",
                    "data": { "path": "users", "token": "abc" }
                }
            ]
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_insomnia(&root);

        assert_eq!(result.collections.len(), 1);
        assert_eq!(result.collections[0].id, "grp_1");

        let request = &result.requests[0];
        assert_eq!(request.method, "GET");
        // {{ _.var }} -> {{env.var}} in url, header value, body and auth.
        assert_eq!(request.url, "https://api.test/{{env.path}}");
        assert_eq!(request.headers[0].value, "Bearer {{env.token}}");
        match &request.body {
            Body::Raw { content_type, text } => {
                assert_eq!(content_type, "application/json");
                assert_eq!(text, "{\"x\": \"{{env.x}}\"}");
            }
            other => panic!("expected raw body, got {other:?}"),
        }
        match &request.auth {
            Auth::Bearer { token } => assert_eq!(token, "{{env.token}}"),
            other => panic!("expected bearer, got {other:?}"),
        }

        assert_eq!(result.environments.len(), 1);
        assert_eq!(result.environments[0].name, "Base");
        assert!(result.environments[0]
            .variables
            .iter()
            .any(|kv| kv.name == "path" && kv.value == "users"));
    }

    #[test]
    fn insomnia_warns_on_complex_template_tags() {
        let json = r#"{
            "resources": [
                {
                    "_id": "req_1",
                    "_type": "request",
                    "parentId": "wrk_1",
                    "name": "Chained",
                    "method": "GET",
                    "url": "https://api.test/{% response 'body', 'req_2', 'b64::JC5pZA==', 'never' %}"
                }
            ]
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_insomnia(&root);
        assert_eq!(
            result
                .warnings
                .iter()
                .filter(|w| w.contains("template tags"))
                .count(),
            1
        );
        // Complex tag left verbatim.
        assert!(result.requests[0].url.contains("{% response"));
    }

    #[test]
    fn insomnia_tag_rewrite_is_utf8_safe() {
        // A multibyte char adjacent to a tag must not panic or corrupt bytes.
        assert_eq!(convert_insomnia_tags("ą{{ _.x }}ę"), "ą{{env.x}}ę");
        // Non plain tag left verbatim.
        assert_eq!(convert_insomnia_tags("{{ _.now() }}"), "{{ _.now() }}");
    }

    // ---------------- HAR ----------------

    #[test]
    fn har_denoise_asset_and_detect_secret() {
        let json = r#"{
            "log": {
                "version": "1.2",
                "entries": [
                    {
                        "request": {
                            "method": "GET",
                            "url": "https://api.example.com/data?q=1",
                            "headers": [
                                { "name": "Authorization", "value": "Bearer sk_live_123" },
                                { "name": "Accept", "value": "application/json" }
                            ],
                            "queryString": [{ "name": "q", "value": "1" }]
                        },
                        "response": { "content": { "mimeType": "application/json" } }
                    },
                    {
                        "request": {
                            "method": "GET",
                            "url": "https://cdn.example.com/logo.png",
                            "headers": []
                        },
                        "response": { "content": { "mimeType": "image/png" } }
                    },
                    {
                        "request": {
                            "method": "POST",
                            "url": "https://api.example.com/login",
                            "headers": [],
                            "postData": {
                                "mimeType": "application/json",
                                "text": "{\"u\":\"a\"}"
                            }
                        },
                        "response": { "content": { "mimeType": "application/json" } }
                    }
                ]
            }
        }"#;
        let root: Value = serde_json::from_str(json).unwrap();
        let result = parse_har(&root);

        // The image request is denoised out; two API requests remain.
        assert_eq!(result.requests.len(), 2);
        assert!(result
            .requests
            .iter()
            .all(|r| r.url.contains("api.example.com")));

        // Query stripped from stored url, kept in query_params.
        let data = result
            .requests
            .iter()
            .find(|r| r.url.ends_with("/data"))
            .unwrap();
        assert_eq!(data.url, "https://api.example.com/data");
        assert_eq!(data.query_params[0].name, "q");

        // POST body parsed.
        let login = result
            .requests
            .iter()
            .find(|r| r.url.ends_with("/login"))
            .unwrap();
        assert!(
            matches!(&login.body, Body::Raw { content_type, .. } if content_type == "application/json")
        );

        // Grouped by host: one collection for api.example.com only (asset host skipped).
        assert_eq!(result.collections.len(), 1);
        assert_eq!(result.collections[0].name, "api.example.com");

        // Warnings: skipped-asset count and secret detection.
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("Skipped 1 static asset")));
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("secret") && w.contains("api.example.com")));
    }

    // ---------------- .http file ----------------

    #[test]
    fn http_file_two_blocks() {
        let text = concat!(
            "### Get users\n",
            "# @name listUsers\n",
            "GET https://api.example.com/users\n",
            "Accept: application/json\n",
            "\n",
            "###\n",
            "POST https://api.example.com/users\n",
            "Content-Type: application/json\n",
            "\n",
            "{\n",
            "  \"name\": \"{{name}}\"\n",
            "}\n"
        );
        let result = parse_http_file(text);
        assert_eq!(result.requests.len(), 2);

        let first = &result.requests[0];
        assert_eq!(first.name, "listUsers");
        assert_eq!(first.method, "GET");
        assert_eq!(first.url, "https://api.example.com/users");
        assert_eq!(first.headers.len(), 1);
        assert_eq!(first.headers[0].name, "Accept");
        assert!(matches!(first.body, Body::None));

        let second = &result.requests[1];
        assert_eq!(second.method, "POST");
        assert_eq!(second.url, "https://api.example.com/users");
        match &second.body {
            Body::Raw { content_type, text } => {
                assert_eq!(content_type, "application/json");
                // {{var}} preserved.
                assert!(text.contains("{{name}}"));
            }
            other => panic!("expected raw body, got {other:?}"),
        }
    }

    // ---------------- shell history ----------------

    #[test]
    fn zsh_history_prefix_filter_and_dedup() {
        let history = concat!(
            ": 1700000001:0;cd /tmp\n",
            ": 1700000002:0;curl https://a.example.com\n",
            ": 1700000003:0;ls -la\n",
            ": 1700000004:0;curl -X POST https://b.example.com\n",
            ": 1700000005:0;curl https://a.example.com\n"
        );
        let curls = extract_curls_from_history(history, None);
        // Newest first, deduped: b then a (a's newest occurrence wins over the
        // older one, and only appears once).
        assert_eq!(
            curls,
            vec![
                "curl https://a.example.com".to_string(),
                "curl -X POST https://b.example.com".to_string(),
            ]
        );
    }

    #[test]
    fn bash_history_plain_lines_and_limit() {
        let history = concat!(
            "curl https://one.example.com\n",
            "echo hi\n",
            "curl https://two.example.com\n",
            "curl https://three.example.com\n"
        );
        let curls = extract_curls_from_history(history, Some(2));
        assert_eq!(
            curls,
            vec![
                "curl https://three.example.com".to_string(),
                "curl https://two.example.com".to_string(),
            ]
        );
    }

    #[test]
    fn history_recognizes_curl_after_env_and_sudo() {
        let history = concat!(
            "FOO=bar curl https://env.example.com\n",
            "sudo curl https://sudo.example.com\n",
            "curling-the-web\n"
        );
        let curls = extract_curls_from_history(history, None);
        assert_eq!(curls.len(), 2);
        assert!(curls.contains(&"FOO=bar curl https://env.example.com".to_string()));
        assert!(curls.contains(&"sudo curl https://sudo.example.com".to_string()));
    }
}
