//! MCP (Model Context Protocol) server over stdio — lets an agent (Claude
//! Code, etc.) drive Ether headlessly: browse collections, inspect requests,
//! and RUN them through the very same libcurl engine + `{{env}}`/`{{secret}}`
//! resolution the GUI and `lok` use. JSON-RPC 2.0, one message per line, per
//! the MCP stdio transport. No sockets are opened by the server itself.

use serde_json::{json, Value};
use std::io::{BufRead, Write};

use crate::{cli, engine, resolve, store};

const PROTOCOL_VERSION: &str = "2024-11-05";
/// Responses handed to a model are capped so a huge body can't blow up the
/// agent's context; the flag in the payload says when truncation happened.
const BODY_CAP_BYTES: usize = 100_000;

/// Blocking serve loop: read JSON-RPC lines from `input`, write responses to
/// `output`. Returns on EOF. Notifications (no `id`) get no response.
pub fn serve<R: BufRead, W: Write>(input: R, mut output: W) {
    for line in input.lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue; // unparseable frame — MCP clients resend; never crash
        };
        if let Some(response) = handle_message(&message) {
            let _ = serde_json::to_writer(&mut output, &response);
            let _ = output.write_all(b"\n");
            let _ = output.flush();
        }
    }
}

/// Dispatch one JSON-RPC message; `None` for notifications.
pub fn handle_message(message: &Value) -> Option<Value> {
    let method = message.get("method").and_then(Value::as_str)?;
    let id = message.get("id").cloned();
    // Notifications (initialized, cancelled, …) need no reply.
    let id = match id {
        Some(id) if !id.is_null() => id,
        _ => return None,
    };
    let params = message.get("params").cloned().unwrap_or(json!({}));

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "ether-mcp", "version": env!("CARGO_PKG_VERSION") }
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => Ok(handle_tool_call(&params)),
        _ => Err((-32601, format!("method not found: {method}"))),
    };

    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, msg)) => json!({
            "jsonrpc": "2.0", "id": id,
            "error": { "code": code, "message": msg }
        }),
    })
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "list_collections",
            "description": "List saved request collections (id, name).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_requests",
            "description": "List saved requests (id, name, method, url, graphql flag). Optionally filter by collection_id.",
            "inputSchema": {
                "type": "object",
                "properties": { "collection_id": { "type": "string" } }
            }
        },
        {
            "name": "get_request",
            "description": "Full definition of one saved request (headers, body, auth, GraphQL meta, assertions).",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "list_environments",
            "description": "List environments (id, name, parent, variable names — secret VALUES are never exposed).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "run_request",
            "description": "Execute a saved request through Ether's libcurl engine with {{env}}/{{secret}} resolution. Returns status, headers, body (capped), timings and assertion outcomes. Secrets are resolved inside Rust and never appear in the output.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Saved request id" },
                    "env": { "type": "string", "description": "Environment NAME (optional)" }
                },
                "required": ["id"]
            }
        }
    ])
}

/// tools/call → a `content` payload. Tool errors surface as isError:true text
/// (per MCP), protocol stays healthy.
fn handle_tool_call(params: &Value) -> Value {
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    match run_tool(name, &args) {
        Ok(payload) => json!({
            "content": [{ "type": "text", "text": payload.to_string() }]
        }),
        Err(message) => json!({
            "isError": true,
            "content": [{ "type": "text", "text": message }]
        }),
    }
}

fn run_tool(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "list_collections" => {
            let collections = store::list_collections()?;
            Ok(json!(collections
                .iter()
                .map(|c| json!({ "id": c.id, "name": c.name, "parent_id": c.parent_id }))
                .collect::<Vec<_>>()))
        }
        "list_requests" => {
            let collection_id = args
                .get("collection_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            let requests = store::list_requests(collection_id)?;
            Ok(json!(requests
                .iter()
                .map(|r| json!({
                    "id": r.id,
                    "collection_id": r.collection_id,
                    "name": r.name,
                    "method": r.method,
                    "url": r.url,
                    "graphql": r.graphql.is_some(),
                }))
                .collect::<Vec<_>>()))
        }
        "get_request" => {
            let id = required_str(args, "id")?;
            let request = store::get_request(id)?.ok_or("no such request id")?;
            serde_json::to_value(&request).map_err(|e| e.to_string())
        }
        "list_environments" => {
            let environments = store::list_environments()?;
            Ok(json!(environments
                .iter()
                .map(|e| json!({
                    "id": e.id,
                    "name": e.name,
                    "parent_id": e.parent_id,
                    // names only — values live in Keychain / local store
                    "secret_names": e.secret_names,
                }))
                .collect::<Vec<_>>()))
        }
        "run_request" => {
            let id = required_str(args, "id")?;
            let env_name = args.get("env").and_then(Value::as_str);
            let request = store::get_request(id)?.ok_or("no such request id")?;
            let env_id = cli::resolve_env_id(env_name)?;
            let spec = resolve::build_resolved_spec(&request, env_id.as_deref())?;
            let response = engine::execute_sync(spec)?;
            let assertions = crate::assert::eval_assertions(&response, &request.assertions);
            let (body, body_capped) = cap_body(&response.body);
            Ok(json!({
                "status": response.status,
                "effective_url": response.effective_url,
                "total_ms": response.timings.total_ms,
                "headers": response.headers,
                "body": body,
                "body_is_base64": response.body_is_base64,
                "body_capped": body_capped,
                "assertions": assertions,
            }))
        }
        other => Err(format!("unknown tool: {other}")),
    }
}

fn required_str<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing required argument: {key}"))
}

fn cap_body(body: &str) -> (String, bool) {
    if body.len() <= BODY_CAP_BYTES {
        return (body.to_string(), false);
    }
    let mut end = BODY_CAP_BYTES;
    while !body.is_char_boundary(end) {
        end -= 1;
    }
    (body[..end].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_reports_tools_capability() {
        let msg = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} });
        let reply = handle_message(&msg).unwrap();
        assert_eq!(reply["result"]["serverInfo"]["name"], "ether-mcp");
        assert!(reply["result"]["capabilities"]["tools"].is_object());
    }

    #[test]
    fn notifications_get_no_reply() {
        let msg = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle_message(&msg).is_none());
    }

    #[test]
    fn tools_list_names_the_five_tools() {
        let msg = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let reply = handle_message(&msg).unwrap();
        let names: Vec<&str> = reply["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            ["list_collections", "list_requests", "get_request", "list_environments", "run_request"]
        );
    }

    #[test]
    fn unknown_method_is_a_jsonrpc_error() {
        let msg = json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list" });
        let reply = handle_message(&msg).unwrap();
        assert_eq!(reply["error"]["code"], -32601);
    }

    #[test]
    fn unknown_tool_is_a_tool_error_not_a_protocol_error() {
        let msg = json!({
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": { "name": "explode", "arguments": {} }
        });
        let reply = handle_message(&msg).unwrap();
        assert_eq!(reply["result"]["isError"], json!(true));
    }

    #[test]
    fn body_cap_respects_char_boundaries() {
        let body = "ż".repeat(BODY_CAP_BYTES); // 2 bytes per char
        let (capped, was_capped) = cap_body(&body);
        assert!(was_capped);
        assert!(capped.len() <= BODY_CAP_BYTES);
        assert!(capped.chars().all(|c| c == 'ż'));
    }
}
