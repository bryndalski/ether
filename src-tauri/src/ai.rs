//! Local AI (Ollama) client — the ONLY code path that may open a socket to the
//! model, and the authoritative redaction boundary. Talks to a hard-pinned
//! loopback host (`http://localhost:11434`) via the existing `curl` engine; no
//! new HTTP stack, no Tauri HTTP plugin, no CSP change. Secrets NEVER reach the
//! model: every message is re-redacted here before any byte leaves.
//! See docs/architecture/local-ai.md §1 & §3.

use std::time::Duration;

use curl::easy::{Easy, List};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Loopback host, pinned as a const so no field (model name, etc.) can redirect
/// egress elsewhere. There is deliberately no setting to point at a remote host.
const OLLAMA_BASE: &str = "http://localhost:11434";

/// Auth header names whose VALUES must never reach the model. Mirrors
/// engine.rs::REDACTED_HEADERS (case-insensitive on the header name).
const REDACTED_HEADER_NAMES: [&str; 5] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
];

/// The greppable marker a secret collapses to on the AI path (distinct from the
/// curl/verbose `•••`).
const REDACTED: &str = "<REDACTED>";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelInfo {
    pub name: String,
    pub size_bytes: u64,
    pub family: Option<String>,
    pub param_size: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiHealth {
    pub running: bool,
    pub models: Vec<AiModelInfo>,
    /// ALWAYS `http://localhost:11434` — backs the "100% local" badge.
    pub endpoint: String,
    pub host_ram_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiChatRequest {
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub schema: Value,
    #[serde(default)]
    pub secret_values: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiChatResult {
    pub raw_json: Value,
    pub model: String,
    pub eval_ms: f64,
}

/// POST `body` (JSON) to a loopback Ollama path and return the response bytes.
/// The host is pinned; only the path varies. Short timeout so a down Ollama
/// fails fast rather than hanging the UI.
fn post_json(path: &str, body: &[u8], timeout_ms: u64) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let mut easy = Easy::new();
    easy.url(&format!("{OLLAMA_BASE}{path}"))
        .map_err(|e| e.to_string())?;
    easy.post(true).map_err(|e| e.to_string())?;
    easy.timeout(Duration::from_millis(timeout_ms))
        .map_err(|e| e.to_string())?;
    let mut headers = List::new();
    headers
        .append("Content-Type: application/json")
        .map_err(|e| e.to_string())?;
    easy.http_headers(headers).map_err(|e| e.to_string())?;
    easy.post_field_size(body.len() as u64)
        .map_err(|e| e.to_string())?;
    {
        let mut transfer = easy.transfer();
        transfer
            .read_function(|into| Ok(read_slice(body, into)))
            .map_err(|e| e.to_string())?;
        transfer
            .write_function(|data| {
                buffer.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;
        transfer.perform().map_err(|e| e.to_string())?;
    }
    Ok(buffer)
}

/// GET a loopback Ollama path; returns bytes, or an error on a connection
/// refusal (callers map that to a "not running" state, never a crash).
fn get_bytes(path: &str, timeout_ms: u64) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let mut easy = Easy::new();
    easy.url(&format!("{OLLAMA_BASE}{path}"))
        .map_err(|e| e.to_string())?;
    easy.timeout(Duration::from_millis(timeout_ms))
        .map_err(|e| e.to_string())?;
    {
        let mut transfer = easy.transfer();
        transfer
            .write_function(|data| {
                buffer.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;
        transfer.perform().map_err(|e| e.to_string())?;
    }
    Ok(buffer)
}

/// Curl read callback shim: copy as much of `src` (from an implicit cursor) into
/// `dst` as fits. curl calls this repeatedly; we track progress via a slice.
fn read_slice(src: &[u8], dst: &mut [u8]) -> usize {
    let n = src.len().min(dst.len());
    dst[..n].copy_from_slice(&src[..n]);
    n
}

/// Parse the Ollama `/api/tags` shape into our `AiModelInfo` list. A missing /
/// empty / unparseable body yields `[]` (never an error) so the picker degrades
/// gracefully.
pub fn parse_tags(bytes: &[u8]) -> Vec<AiModelInfo> {
    let value: Value = match serde_json::from_slice(bytes) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let models = match value.get("models").and_then(Value::as_array) {
        Some(models) => models,
        None => return Vec::new(),
    };
    models
        .iter()
        .filter_map(|entry| {
            let name = entry.get("name").and_then(Value::as_str)?.to_string();
            let size_bytes = entry.get("size").and_then(Value::as_u64).unwrap_or(0);
            let details = entry.get("details");
            let family = details
                .and_then(|d| d.get("family"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let param_size = details
                .and_then(|d| d.get("parameter_size"))
                .and_then(Value::as_str)
                .map(str::to_string);
            Some(AiModelInfo {
                name,
                size_bytes,
                family,
                param_size,
            })
        })
        .collect()
}

/// The authoritative redaction pass. Runs over EVERY message content before it
/// can leave for Ollama — belt-and-suspenders even if the FE mirror already ran,
/// so a buggy caller cannot leak a secret past this boundary. Pure over strings.
pub fn redact_for_model(messages: Vec<AiMessage>, secret_values: &[String]) -> Vec<AiMessage> {
    messages
        .into_iter()
        .map(|message| AiMessage {
            role: message.role,
            content: redact_content(&message.content, secret_values),
        })
        .collect()
}

fn redact_content(content: &str, secret_values: &[String]) -> String {
    let header_scrubbed = content
        .lines()
        .map(redact_header_line)
        .collect::<Vec<_>>()
        .join("\n");
    // Preserve a trailing newline the line-split would otherwise drop.
    let mut out = header_scrubbed;
    if content.ends_with('\n') {
        out.push('\n');
    }
    for value in secret_values {
        if value.trim().is_empty() {
            continue;
        }
        out = out.replace(value, REDACTED);
    }
    out
}

/// Redact the VALUE of a sensitive `Name: value` header line, keeping the name.
/// Curl-verbose transcripts prefix header lines with `> ` / `< ` / `* ` — those
/// prefixes are stripped for the match and preserved in the output, so a pasted
/// Timeline log redacts the same as a bare header. `{{secret.*}}` is never
/// expanded here — it is opaque text that stays verbatim unless it happens to
/// be a sensitive header's value.
fn redact_header_line(line: &str) -> String {
    let after_indent = line.trim_start();
    let rest = match after_indent.as_bytes().first() {
        Some(b'>' | b'<' | b'*') => after_indent[1..].trim_start(),
        _ => after_indent,
    };
    if let Some(colon) = rest.find(':') {
        let name = rest[..colon].trim().to_ascii_lowercase();
        if REDACTED_HEADER_NAMES.contains(&name.as_str()) {
            let prefix = &line[..line.len() - rest.len()];
            return format!("{prefix}{}: {REDACTED}", &rest[..colon]);
        }
    }
    line.to_string()
}

#[tauri::command]
pub fn ai_health() -> AiHealth {
    let endpoint = OLLAMA_BASE.to_string();
    match get_bytes("/api/tags", 800) {
        Ok(bytes) if !bytes.is_empty() => AiHealth {
            running: true,
            models: parse_tags(&bytes),
            endpoint,
            host_ram_bytes: None,
        },
        // Connection refused / empty body ⇒ not running (never a thrown crash).
        _ => AiHealth {
            running: false,
            models: Vec::new(),
            endpoint,
            host_ram_bytes: None,
        },
    }
}

#[tauri::command]
pub fn ai_tags() -> Vec<AiModelInfo> {
    get_bytes("/api/tags", 800)
        .map(|bytes| parse_tags(&bytes))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn ai_chat(request: AiChatRequest) -> Result<AiChatResult, String> {
    tauri::async_runtime::spawn_blocking(move || ai_chat_sync(request))
        .await
        .map_err(|join_error| format!("ai task panicked: {join_error}"))?
}

/// Synchronous worker: re-redact, build the /api/chat body, POST to loopback,
/// parse the model's structured `message.content` as JSON. A non-JSON reply is
/// an error (surfaced as a toast; no artifact created).
fn ai_chat_sync(request: AiChatRequest) -> Result<AiChatResult, String> {
    let mut secret_values = request.secret_values;
    secret_values.extend(known_secret_values());
    let redacted = redact_for_model(request.messages, &secret_values);
    let body = build_chat_body(&request.model, &redacted, &request.schema);
    let bytes = post_json("/api/chat", body.as_bytes(), 60_000)?;
    parse_chat_result(&bytes, &request.model)
}

/// Gather every known secret VALUE (all environments' `secret_names` resolved
/// through the Keychain) so the known-value scrub never depends on the caller
/// remembering to pass them — the FE cannot read Keychain values by design, so
/// this boundary is the only place that can build the scrub set. A store or
/// Keychain failure degrades to fewer known values; the header scrub still runs.
fn known_secret_values() -> Vec<String> {
    let mut values = Vec::new();
    if let Ok(envs) = crate::store::list_environments() {
        for env in envs {
            for name in &env.secret_names {
                if let Ok(value) = crate::secrets::secret_get(name) {
                    if !value.trim().is_empty() {
                        values.push(value);
                    }
                }
            }
        }
    }
    values
}

/// Assemble the /api/chat request body. Exposed for the wire test so it can
/// assert on the exact bytes that would be POSTed.
pub fn build_chat_body(model: &str, messages: &[AiMessage], schema: &Value) -> String {
    let messages_json: Vec<Value> = messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    json!({
        "model": model,
        "messages": messages_json,
        "format": schema,
        "stream": false,
        "options": { "temperature": 0.2 }
    })
    .to_string()
}

fn parse_chat_result(bytes: &[u8], model: &str) -> Result<AiChatResult, String> {
    let envelope: Value =
        serde_json::from_slice(bytes).map_err(|_| "model returned unparseable output".to_string())?;
    let content = envelope
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "model returned no message content".to_string())?;
    let raw_json: Value =
        serde_json::from_str(content).map_err(|_| "model returned unparseable output".to_string())?;
    let eval_ms = envelope
        .get("eval_duration")
        .and_then(Value::as_f64)
        .map(|ns| ns / 1_000_000.0)
        .unwrap_or(0.0);
    Ok(AiChatResult {
        raw_json,
        model: model.to_string(),
        eval_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn redacts_authorization_and_api_key_values() {
        let messages = vec![
            AiMessage {
                role: "user".into(),
                content: "Authorization: Bearer sk-live-999".into(),
            },
            AiMessage {
                role: "user".into(),
                content: "x-api-key: k-secret".into(),
            },
        ];
        let out = redact_for_model(messages, &[]);
        let joined: String = out.iter().map(|m| m.content.clone()).collect();
        assert!(!joined.contains("sk-live-999"));
        assert!(!joined.contains("k-secret"));
        assert!(joined.contains("Authorization: <REDACTED>"));
        assert!(joined.contains("x-api-key: <REDACTED>"));
    }

    #[test]
    fn redacts_curl_verbose_prefixed_header_lines() {
        // Pasted Timeline / `curl -v` transcripts prefix headers with `> ` (sent),
        // `< ` (received) — the redaction must see through the prefix (issue #42).
        let messages = vec![AiMessage {
            role: "user".into(),
            content: "> Authorization: Bearer sk-live-777\n< set-cookie: sid=opaque\n  > x-api-key: k-77\n* Cookie: a=b".into(),
        }];
        let out = redact_for_model(messages, &[]);
        let content = &out[0].content;
        assert!(!content.contains("sk-live-777"));
        assert!(!content.contains("sid=opaque"));
        assert!(!content.contains("k-77"));
        assert!(!content.contains("a=b"));
        // Prefixes and header names survive; only values collapse.
        assert!(content.contains("> Authorization: <REDACTED>"));
        assert!(content.contains("< set-cookie: <REDACTED>"));
        assert!(content.contains("  > x-api-key: <REDACTED>"));
        assert!(content.contains("* Cookie: <REDACTED>"));
    }

    #[test]
    fn verbose_prefix_on_clean_lines_stays_verbatim() {
        let messages = vec![AiMessage {
            role: "user".into(),
            content: "> GET /x HTTP/1.1\n< content-type: application/json".into(),
        }];
        let out = redact_for_model(messages.clone(), &[]);
        assert_eq!(out[0].content, messages[0].content);
    }

    #[test]
    fn redacts_known_secret_values_and_preserves_templates() {
        let messages = vec![AiMessage {
            role: "user".into(),
            content: "url=/x?t={{secret.token}} raw=live-kc-value".into(),
        }];
        let out = redact_for_model(messages, &["live-kc-value".into()]);
        assert!(!out[0].content.contains("live-kc-value"));
        // template stays verbatim, never expanded
        assert!(out[0].content.contains("{{secret.token}}"));
        assert!(out[0].content.contains(REDACTED));
    }

    #[test]
    fn redaction_is_noop_on_clean_prompts() {
        let messages = vec![AiMessage {
            role: "system".into(),
            content: "Content-Type: application/json".into(),
        }];
        let out = redact_for_model(messages.clone(), &[]);
        assert_eq!(out[0].content, messages[0].content);
    }

    #[test]
    fn parse_tags_maps_ollama_shape_and_empty_is_empty() {
        let body = br#"{"models":[{"name":"llama3.1:8b","size":4700000000,
            "details":{"family":"llama","parameter_size":"8B"}}]}"#;
        let models = parse_tags(body);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].name, "llama3.1:8b");
        assert_eq!(models[0].family.as_deref(), Some("llama"));
        assert_eq!(models[0].param_size.as_deref(), Some("8B"));
        // empty / garbage → [] (never an error)
        assert!(parse_tags(b"").is_empty());
        assert!(parse_tags(b"not json").is_empty());
    }

    #[test]
    fn build_chat_body_pins_low_temp_no_stream_and_format() {
        let schema = json!({"type":"object"});
        let messages = vec![AiMessage {
            role: "user".into(),
            content: "hi".into(),
        }];
        let body: Value = serde_json::from_str(&build_chat_body("m", &messages, &schema)).unwrap();
        assert_eq!(body["stream"], json!(false));
        assert_eq!(body["options"]["temperature"], json!(0.2));
        assert_eq!(body["format"], schema);
    }

    // The PRIMARY security test: assert on the WIRE. Drive a POST whose messages
    // carry a bearer token + a known secret, and confirm neither appears in the
    // raw bytes the server received. Uses a canned loopback TcpListener (the
    // resolve.rs harness style) — no real Ollama.
    #[test]
    fn secret_never_appears_in_bytes_sent_to_ollama() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap();
            let received = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}",
            );
            received
        });

        // Redact first (as ai_chat_sync does), then POST to the canned server.
        // Covers both header shapes: bare and curl-verbose-prefixed (issue #42).
        let messages = redact_for_model(
            vec![
                AiMessage {
                    role: "user".into(),
                    content: "Authorization: Bearer sk-live-DEADBEEF".into(),
                },
                AiMessage {
                    role: "user".into(),
                    content: "> Authorization: Bearer sk-live-VERBOSE".into(),
                },
                AiMessage {
                    role: "user".into(),
                    content: "echoed=kc-plaintext-secret".into(),
                },
            ],
            &["kc-plaintext-secret".into()],
        );
        let body = build_chat_body("m", &messages, &json!({}));

        let mut easy = Easy::new();
        easy.url(&format!("http://{addr}/api/chat")).unwrap();
        easy.post(true).unwrap();
        easy.post_field_size(body.len() as u64).unwrap();
        {
            let mut t = easy.transfer();
            let bytes = body.as_bytes();
            t.read_function(move |into| Ok(read_slice(bytes, into))).unwrap();
            t.write_function(|d| Ok(d.len())).unwrap();
            t.perform().unwrap();
        }

        let received = handle.join().unwrap();
        assert!(
            !received.contains("sk-live-DEADBEEF"),
            "bearer token leaked to the wire"
        );
        assert!(
            !received.contains("sk-live-VERBOSE"),
            "curl-verbose-prefixed bearer token leaked to the wire"
        );
        assert!(
            !received.contains("kc-plaintext-secret"),
            "keychain secret value leaked to the wire"
        );
        assert!(received.contains("<REDACTED>"));
    }

    #[test]
    fn parse_chat_result_rejects_non_json_content() {
        // `content` is a STRING whose value is itself JSON — build via serde so
        // the nested quotes are escaped correctly (a raw byte-string can't hold
        // backslash escapes).
        let bad = json!({ "message": { "content": "not json at all" } }).to_string();
        assert!(parse_chat_result(bad.as_bytes(), "m").is_err());

        let inner = json!({ "markdown": "# ok" }).to_string();
        let good = json!({
            "message": { "content": inner },
            "eval_duration": 1_200_000
        })
        .to_string();
        let result = parse_chat_result(good.as_bytes(), "m").unwrap();
        assert_eq!(result.raw_json["markdown"], json!("# ok"));
        assert!((result.eval_ms - 1.2).abs() < 0.001);
    }
}
