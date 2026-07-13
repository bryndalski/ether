//! Sequential workflow executor. Walks a saved graph from its start node along
//! edges, running each node in turn against REAL endpoints, threading a run-scoped
//! variable map (from ExtractNode) into every downstream RequestNode's
//! interpolation context. Streams per-node progress to the FE over "workflow-run".
//!
//! Reuse: resolve::resolve_spec + engine::execute_request for RequestNode;
//! interp::RenderCtx (with its `var.` namespace) for run-vars; a
//! subscriptions.rs-style registry + EventSink for the run lifecycle and channel.
//!
//! The traversal core (`run_graph`) takes an injectable request runner so the
//! step walk is unit-testable against a local TCP server without a Tauri
//! AppHandle — the executor is otherwise a thin wiring layer over resolve+engine.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::json_path;
use crate::models::{
    ConditionExpr, RequestSource, ResponseData, StoredRequest, Workflow, WorkflowNode,
};
use crate::{engine, resolve, store};

/// The single Tauri event channel every workflow run emits on. The `run_id` field
/// on each [`WorkflowEvent`] routes it to the right FE run.
const CHANNEL: &str = "workflow-run";
/// Hard loop guard — caps the number of node executions so a Condition that loops
/// back cannot run forever (checked before every step).
const MAX_STEPS: usize = 200;
/// Wall-clock cap for a whole run — guards a run that stalls on slow requests or a
/// large Delay (checked before every step and enforced inside Delay).
const MAX_RUN: Duration = Duration::from_secs(300);

// ---------- FE-facing event contract (mirrored in src/lib/workflow.ts) ----------

/// One streamed event for a workflow run. Discriminated by `kind`; `run_id` routes
/// it on the FE, `seq` gives a total order, `ts` is the authoritative Rust emit
/// time. `data`/`message` map straight to the FE's per-node reducer.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WorkflowEvent {
    pub run_id: String,
    pub seq: u64,
    pub ts: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    pub kind: WorkflowEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowEventKind {
    Started,   // node entered
    Succeeded, // node finished OK (data carries a small summary)
    Failed,    // node errored → run halts (message set)
    Extracted, // ExtractNode bound a var (data: {var_name, value})
    Log,       // run-level line (start / complete / stopped / limit hit)
}

// ---------- run registry (mirrors subscriptions::registry) ----------

struct StopHandle {
    stop: watch::Sender<bool>,
    task: JoinHandle<()>,
}

fn registry() -> &'static Mutex<HashMap<String, StopHandle>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, StopHandle>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn deregister(run_id: &str) {
    registry()
        .lock()
        .expect("workflow registry poisoned")
        .remove(run_id);
}

// ---------- event sink ----------

/// Emits [`WorkflowEvent`]s for one run onto the shared channel, stamping a
/// monotonic `seq` and an RFC-3339 timestamp. A test sink swaps the emit target.
trait Emit: Send + Sync {
    fn emit(&self, event: &WorkflowEvent);
}

struct AppEmit(AppHandle);
impl Emit for AppEmit {
    fn emit(&self, event: &WorkflowEvent) {
        let _ = self.0.emit(CHANNEL, event);
    }
}

struct EventSink {
    run_id: String,
    seq: AtomicU64,
    target: Box<dyn Emit>,
}

impl EventSink {
    fn new(run_id: String, target: Box<dyn Emit>) -> Self {
        Self {
            run_id,
            seq: AtomicU64::new(0),
            target,
        }
    }

    fn emit(
        &self,
        kind: WorkflowEventKind,
        node_id: Option<String>,
        data: Option<Value>,
        message: Option<String>,
    ) {
        let event = WorkflowEvent {
            run_id: self.run_id.clone(),
            seq: self.seq.fetch_add(1, Ordering::SeqCst),
            ts: chrono::Utc::now().to_rfc3339(),
            node_id,
            kind,
            data,
            message,
        };
        self.target.emit(&event);
    }

    fn started(&self, node_id: &str) {
        self.emit(
            WorkflowEventKind::Started,
            Some(node_id.to_string()),
            None,
            None,
        );
    }

    fn succeeded(&self, node_id: &str, data: Value) {
        self.emit(
            WorkflowEventKind::Succeeded,
            Some(node_id.to_string()),
            Some(data),
            None,
        );
    }

    fn extracted(&self, node_id: &str, var_name: &str, value: &Value) {
        self.emit(
            WorkflowEventKind::Extracted,
            Some(node_id.to_string()),
            Some(json!({ "var_name": var_name, "value": value })),
            None,
        );
    }

    fn failed(&self, node_id: Option<&str>, message: String) {
        self.emit(
            WorkflowEventKind::Failed,
            node_id.map(str::to_string),
            None,
            Some(message),
        );
    }

    fn log(&self, message: &str) {
        self.emit(
            WorkflowEventKind::Log,
            None,
            None,
            Some(message.to_string()),
        );
    }
}

// ---------- request runner abstraction (for testability) ----------

/// The future a request runner returns: the resolved response (or an error). Boxed
/// so the runner can be a trait object while still being `async` — a nested
/// `block_on` inside a Tokio worker panics, so the engine call must be awaited.
type RunRequestFuture<'f> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<ResponseData, String>> + Send + 'f>>;

/// How a RequestNode actually reaches the network. Production wires this to
/// resolve+engine with run-vars merged into the interpolation ctx; tests inject a
/// closure hitting a local server so the graph walk needs no Tauri/store. The
/// closure returns a future the traversal awaits — never a nested `block_on`.
type RunRequestFn<'a> = dyn for<'f> Fn(&'f WorkflowNode, &'f HashMap<String, String>) -> RunRequestFuture<'f>
    + Send
    + Sync
    + 'a;

// ---------- commands ----------

/// Start a workflow run: validate the graph, mint a run_id, spawn the traversal
/// task, register a StopHandle, and return the id immediately. Events stream on
/// "workflow-run". Identical lifecycle to `subscription_start`.
#[tauri::command]
pub async fn workflow_run(
    app: AppHandle,
    workflow: Workflow,
    environment_id: Option<String>,
) -> Result<String, String> {
    validate_graph(&workflow)?;

    let run_id = uuid::Uuid::new_v4().to_string();
    let sink = EventSink::new(run_id.clone(), Box::new(AppEmit(app)));
    let (stop_tx, stop_rx) = watch::channel(false);

    let task_run_id = run_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let env_id = environment_id.clone();
        let runner = live_runner(env_id);
        run_graph(&workflow, &sink, &runner, stop_rx).await;
        deregister(&task_run_id);
    });

    registry()
        .lock()
        .expect("workflow registry poisoned")
        .insert(
            run_id.clone(),
            StopHandle {
                stop: stop_tx,
                task: handle,
            },
        );

    Ok(run_id)
}

/// Stop a live run. Returns `Ok(false)` if the id already finished. Signals a
/// graceful stop, then aborts the task as a backstop.
#[tauri::command]
pub async fn workflow_stop(run_id: String) -> Result<bool, String> {
    let (stop, task) = {
        let mut reg = registry().lock().expect("workflow registry poisoned");
        match reg.remove(&run_id) {
            Some(handle) => (handle.stop, handle.task),
            None => return Ok(false),
        }
    };
    let _ = stop.send(true);
    tokio::time::sleep(Duration::from_millis(100)).await;
    task.abort();
    Ok(true)
}

/// Build the production request runner: resolve each RequestNode's StoredRequest
/// (ref XOR inline) against the environment, layer run-vars as a `var.` namespace,
/// and execute through the engine. History is written by the engine.
fn live_runner(environment_id: Option<String>) -> Box<RunRequestFn<'static>> {
    Box::new(move |node, run_vars| {
        // Resolve synchronously (store access + interpolation), then return a
        // future that awaits the engine — no nested block_on.
        let prepared = prepare_spec(node, run_vars, environment_id.as_deref());
        Box::pin(async move {
            let spec = prepared?;
            engine::execute_request(spec).await
        })
    })
}

/// Resolve a RequestNode into an executable [`RequestSpec`]: pick the request
/// (ref XOR inline), build the ctx, layer run-vars as `var.` entries, interpolate.
fn prepare_spec(
    node: &WorkflowNode,
    run_vars: &HashMap<String, String>,
    environment_id: Option<&str>,
) -> Result<crate::models::RequestSpec, String> {
    let (stored, _node_id) = stored_request_for(node)?;
    let environments = store::list_environments()?;
    let flat = resolve::flatten_env(&environments, environment_id);
    let mut ctx = resolve::build_render_ctx(&environments, environment_id, &flat, false)?;
    for (name, value) in run_vars {
        ctx.vars.insert(name.clone(), value.clone());
    }
    resolve::resolve_spec(&stored, &ctx, false)
}

/// Resolve a RequestNode into a concrete StoredRequest: an inline copy is used
/// verbatim; a `request_ref` is looked up in the store (dangling ref → error).
fn stored_request_for(node: &WorkflowNode) -> Result<(StoredRequest, String), String> {
    match node {
        WorkflowNode::Request { id, source, .. } => match source {
            RequestSource::Request(request) => Ok((request.as_ref().clone(), id.clone())),
            RequestSource::RequestRef(request_id) => match store::get_request(request_id)? {
                Some(request) => Ok((request, id.clone())),
                None => Err(format!("request not found: {request_id}")),
            },
        },
        _ => Err("stored_request_for called on a non-request node".to_string()),
    }
}

// ---------- graph validation ----------

/// The start node = the single node with in-degree 0. v1 is a linear/branching
/// path, not a DAG scheduler, so zero or many start nodes is a hard error.
fn find_start(workflow: &Workflow) -> Result<String, String> {
    if workflow.nodes.is_empty() {
        return Err("workflow has no nodes".to_string());
    }
    let has_incoming: std::collections::HashSet<&str> =
        workflow.edges.iter().map(|e| e.to.as_str()).collect();
    let starts: Vec<&str> = workflow
        .nodes
        .iter()
        .map(WorkflowNode::id)
        .filter(|id| !has_incoming.contains(id))
        .collect();
    match starts.as_slice() {
        [single] => Ok(single.to_string()),
        _ => Err("workflow has no unique start node".to_string()),
    }
}

/// Reject a graph whose edges point at ids that do not exist before a run begins.
fn validate_graph(workflow: &Workflow) -> Result<(), String> {
    let ids: std::collections::HashSet<&str> =
        workflow.nodes.iter().map(WorkflowNode::id).collect();
    for edge in &workflow.edges {
        if !ids.contains(edge.from.as_str()) {
            return Err(format!("edge from unknown node: {}", edge.from));
        }
        if !ids.contains(edge.to.as_str()) {
            return Err(format!("edge to unknown node: {}", edge.to));
        }
    }
    find_start(workflow)?;
    Ok(())
}

// ---------- traversal ----------

/// Walk the graph sequentially from the start node, executing each node and
/// emitting per-node events, until a terminal node (no outgoing edge), a failure,
/// a limit, or a graceful stop. Never panics.
async fn run_graph(
    workflow: &Workflow,
    sink: &EventSink,
    run_request: &RunRequestFn<'_>,
    mut stop: watch::Receiver<bool>,
) {
    sink.log("run started");

    let start = match find_start(workflow) {
        Ok(id) => id,
        Err(message) => {
            sink.failed(None, message);
            return;
        }
    };

    let began = Instant::now();
    let mut run_vars: HashMap<String, String> = HashMap::new();
    let mut last_response: Option<ResponseData> = None;
    let mut cursor = start;
    let mut steps = 0usize;

    loop {
        if *stop.borrow() {
            sink.log("stopped");
            return;
        }
        steps += 1;
        if steps > MAX_STEPS {
            sink.failed(None, format!("step limit exceeded ({MAX_STEPS})"));
            return;
        }
        if began.elapsed() > MAX_RUN {
            sink.failed(
                None,
                format!("time limit exceeded ({}s)", MAX_RUN.as_secs()),
            );
            return;
        }

        let node = match node_by_id(workflow, &cursor) {
            Some(node) => node,
            None => {
                sink.failed(Some(&cursor), format!("node not found: {cursor}"));
                return;
            }
        };
        sink.started(node.id());

        let outcome = execute_node(
            node,
            sink,
            run_request,
            &mut run_vars,
            &mut last_response,
            began,
            &mut stop,
        )
        .await;

        let branch = match outcome {
            NodeOutcome::Continue => None,
            NodeOutcome::Branch(taken) => Some(taken),
            NodeOutcome::Halt => return, // failure already emitted
        };

        match next_edge(workflow, node.id(), branch) {
            Some(next) => cursor = next,
            None => {
                sink.log("run complete");
                return;
            }
        }
    }
}

/// The control-flow result of running one node.
enum NodeOutcome {
    /// Follow the single sequential (branch == None) outgoing edge.
    Continue,
    /// A ConditionNode result — follow the outgoing edge whose branch matches.
    Branch(bool),
    /// A failure was emitted; the run must stop.
    Halt,
}

async fn execute_node(
    node: &WorkflowNode,
    sink: &EventSink,
    run_request: &RunRequestFn<'_>,
    run_vars: &mut HashMap<String, String>,
    last_response: &mut Option<ResponseData>,
    began: Instant,
    stop: &mut watch::Receiver<bool>,
) -> NodeOutcome {
    match node {
        WorkflowNode::Request { id, .. } => match run_request(node, run_vars).await {
            Ok(response) => {
                sink.succeeded(
                    id,
                    json!({
                        "status": response.status,
                        "total_ms": response.timings.total_ms,
                        "size": response.size_download_bytes,
                    }),
                );
                *last_response = Some(response);
                NodeOutcome::Continue
            }
            Err(message) => {
                sink.failed(Some(id), message);
                NodeOutcome::Halt
            }
        },
        WorkflowNode::Extract {
            id,
            source,
            var_name,
            ..
        } => {
            let body = match last_response.as_ref() {
                Some(response) => response.body.as_str(),
                None => {
                    sink.failed(Some(id), "extract: no previous response".to_string());
                    return NodeOutcome::Halt;
                }
            };
            let parsed: Value = match serde_json::from_str(body) {
                Ok(value) => value,
                Err(_) => {
                    sink.failed(
                        Some(id),
                        "extract: previous response is not JSON".to_string(),
                    );
                    return NodeOutcome::Halt;
                }
            };
            let resolved = json_path::resolve(&parsed, source);
            if !resolved.found {
                sink.failed(Some(id), format!("extract: path not found: {source}"));
                return NodeOutcome::Halt;
            }
            let stringified = stringify_value(&resolved.value);
            run_vars.insert(var_name.clone(), stringified);
            sink.extracted(id, var_name, &resolved.value);
            NodeOutcome::Continue
        }
        WorkflowNode::Condition { id, expr, .. } => {
            match evaluate_condition(expr, last_response.as_ref()) {
                Ok(result) => {
                    sink.succeeded(id, json!({ "result": result }));
                    NodeOutcome::Branch(result)
                }
                Err(message) => {
                    sink.failed(Some(id), message);
                    NodeOutcome::Halt
                }
            }
        }
        WorkflowNode::Delay { id, ms, .. } => {
            // Cap the delay so a huge ms cannot exceed the wall-clock budget, and
            // select against the stop signal so a stop cancels mid-delay.
            let remaining = MAX_RUN.saturating_sub(began.elapsed());
            let wait = Duration::from_millis(*ms).min(remaining);
            tokio::select! {
                _ = tokio::time::sleep(wait) => {
                    sink.succeeded(id, json!({ "waited_ms": wait.as_millis() as u64 }));
                    NodeOutcome::Continue
                }
                _ = stop.changed() => {
                    sink.log("stopped");
                    NodeOutcome::Halt
                }
            }
        }
    }
}

/// Evaluate a ConditionExpr against the last response (status or JSONPath).
fn evaluate_condition(
    expr: &ConditionExpr,
    last_response: Option<&ResponseData>,
) -> Result<bool, String> {
    let response = last_response.ok_or_else(|| "condition: no previous response".to_string())?;
    match expr {
        ConditionExpr::StatusEquals { expected } => Ok(response.status == u32::from(*expected)),
        ConditionExpr::StatusInRange { min, max } => {
            Ok(response.status >= u32::from(*min) && response.status <= u32::from(*max))
        }
        ConditionExpr::JsonPathExists { path } => {
            let parsed: Value = serde_json::from_str(&response.body)
                .map_err(|_| "condition: previous response is not JSON".to_string())?;
            Ok(json_path::resolve(&parsed, path).found)
        }
        ConditionExpr::JsonPathEquals { path, expected } => {
            let parsed: Value = serde_json::from_str(&response.body)
                .map_err(|_| "condition: previous response is not JSON".to_string())?;
            let resolved = json_path::resolve(&parsed, path);
            Ok(resolved.found && json_path::value_matches_expected(&resolved.value, expected))
        }
    }
}

/// Pick the outgoing edge from `node_id`. For a branch result, take the edge whose
/// `branch == Some(result)`; otherwise the single sequential edge (branch None).
fn next_edge(workflow: &Workflow, node_id: &str, branch: Option<bool>) -> Option<String> {
    match branch {
        Some(taken) => workflow
            .edges
            .iter()
            .find(|edge| edge.from == node_id && edge.branch == Some(taken))
            .map(|edge| edge.to.clone()),
        None => workflow
            .edges
            .iter()
            .find(|edge| edge.from == node_id && edge.branch.is_none())
            .map(|edge| edge.to.clone()),
    }
}

fn node_by_id<'a>(workflow: &'a Workflow, id: &str) -> Option<&'a WorkflowNode> {
    workflow.nodes.iter().find(|node| node.id() == id)
}

/// String form of an extracted value: a bare string keeps its text (so a token
/// interpolates cleanly), everything else uses compact JSON. Matches how the FE
/// stringifies an extracted value for display.
fn stringify_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interp;
    use crate::models::{
        Auth, Body, ConditionExpr, KeyValue, NodePosition, RequestOptions, RequestSource,
        RequestSpec, ResponseData, StoredRequest, Timings, Workflow, WorkflowEdge, WorkflowNode,
    };
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex as StdMutex};

    // A test sink that records every emitted event into a shared Vec.
    struct RecordingEmit(Arc<StdMutex<Vec<WorkflowEvent>>>);
    impl Emit for RecordingEmit {
        fn emit(&self, event: &WorkflowEvent) {
            self.0.lock().unwrap().push(event.clone());
        }
    }

    fn recording_sink() -> (EventSink, Arc<StdMutex<Vec<WorkflowEvent>>>) {
        let events = Arc::new(StdMutex::new(Vec::new()));
        let sink = EventSink::new(
            "run-test".to_string(),
            Box::new(RecordingEmit(events.clone())),
        );
        (sink, events)
    }

    fn request_node(id: &str, request: StoredRequest) -> WorkflowNode {
        WorkflowNode::Request {
            id: id.to_string(),
            source: RequestSource::Request(Box::new(request)),
            position: NodePosition { x: 0.0, y: 0.0 },
        }
    }

    fn stored(url: &str, headers: Vec<KeyValue>) -> StoredRequest {
        StoredRequest {
            id: String::new(),
            collection_id: "c".into(),
            name: "n".into(),
            method: "GET".into(),
            url: url.into(),
            headers,
            query_params: vec![],
            body: Body::None,
            auth: Auth::None,
            options: RequestOptions::default(),
            sort_order: 0,
            docs_md: None,
            graphql: None,
            assertions: vec![],
        }
    }

    fn kinds(
        events: &Arc<StdMutex<Vec<WorkflowEvent>>>,
    ) -> Vec<(WorkflowEventKind, Option<String>)> {
        events
            .lock()
            .unwrap()
            .iter()
            .map(|e| (e.kind, e.node_id.clone()))
            .collect()
    }

    /// A local one-shot HTTP server that captures the raw request text and replies
    /// with the given status + JSON body. Follows resolve.rs's local-server pattern.
    fn serve_once(status: u16, body: &'static str) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let host = format!("{}:{}", addr.ip(), addr.port());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap();
            let request_text = String::from_utf8_lossy(&buf[..n]).to_string();
            let response = format!(
                "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.flush().unwrap();
            request_text
        });
        (host, handle)
    }

    /// The production-shaped runner, but resolving against a fixed in-memory ctx
    /// (no store) so a RequestNode's run-vars still thread through resolve_spec.
    fn direct_runner() -> Box<RunRequestFn<'static>> {
        Box::new(|node, run_vars| {
            // Resolve eagerly (sync), then return the engine future to await.
            let prepared = (|| {
                let (stored, _id) = super::stored_request_for(node)?;
                let mut ctx = interp::RenderCtx::default();
                for (name, value) in run_vars {
                    ctx.vars.insert(name.clone(), value.clone());
                }
                let spec: RequestSpec = resolve::resolve_spec(&stored, &ctx, false)?;
                Ok::<_, String>(spec)
            })();
            Box::pin(async move {
                let spec = prepared?;
                engine::execute_request(spec).await
            })
        })
    }

    #[test]
    fn extract_then_use_var_in_next_request() {
        // Node A GET /a -> {"id":"abc"}; Extract $.id -> token; Node B GET /b with
        // header X-Token: {{var.token}}. Assert the server saw X-Token: abc.
        let (host_a, server_a) = serve_once(200, "{\"id\":\"abc\"}");
        let (host_b, server_b) = serve_once(200, "{\"ok\":true}");

        let node_a = request_node("a", stored(&format!("http://{host_a}/a"), vec![]));
        let node_b = request_node(
            "b",
            stored(
                &format!("http://{host_b}/b"),
                vec![KeyValue {
                    name: "X-Token".into(),
                    value: "{{var.token}}".into(),
                    enabled: true,
                }],
            ),
        );
        let workflow = Workflow {
            id: "w".into(),
            name: "chain".into(),
            nodes: vec![
                node_a,
                WorkflowNode::Extract {
                    id: "x".into(),
                    source: "$.id".into(),
                    var_name: "token".into(),
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                node_b,
            ],
            edges: vec![
                WorkflowEdge {
                    from: "a".into(),
                    to: "x".into(),
                    branch: None,
                },
                WorkflowEdge {
                    from: "x".into(),
                    to: "b".into(),
                    branch: None,
                },
            ],
        };

        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        let runner = direct_runner();
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));

        server_a.join().unwrap();
        let request_b = server_b.join().unwrap();
        assert!(
            request_b.to_ascii_lowercase().contains("x-token: abc"),
            "run-var did not thread into request B headers: {request_b}"
        );
        // The extracted event carried the value.
        let extracted = events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.kind == WorkflowEventKind::Extracted);
        assert!(extracted, "an extracted event was emitted");
        // Terminal log present.
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.message.as_deref() == Some("run complete")));
    }

    #[test]
    fn condition_true_branch_is_taken() {
        // A request returns 200; a Condition status_equals 200 selects branch=true.
        let (host, server) = serve_once(200, "{\"ok\":true}");
        let workflow = Workflow {
            id: "w".into(),
            name: "branch".into(),
            nodes: vec![
                request_node("r", stored(&format!("http://{host}/x"), vec![])),
                WorkflowNode::Condition {
                    id: "c".into(),
                    expr: ConditionExpr::StatusEquals { expected: 200 },
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                WorkflowNode::Delay {
                    id: "yes".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                WorkflowNode::Delay {
                    id: "no".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
            ],
            edges: vec![
                WorkflowEdge {
                    from: "r".into(),
                    to: "c".into(),
                    branch: None,
                },
                WorkflowEdge {
                    from: "c".into(),
                    to: "yes".into(),
                    branch: Some(true),
                },
                WorkflowEdge {
                    from: "c".into(),
                    to: "no".into(),
                    branch: Some(false),
                },
            ],
        };

        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        let runner = direct_runner();
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));
        server.join().unwrap();

        let started_nodes: Vec<String> = events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.kind == WorkflowEventKind::Started)
            .filter_map(|e| e.node_id.clone())
            .collect();
        assert!(
            started_nodes.contains(&"yes".to_string()),
            "true branch reached"
        );
        assert!(
            !started_nodes.contains(&"no".to_string()),
            "false branch skipped"
        );
    }

    #[test]
    fn condition_false_branch_is_taken_on_500() {
        let (host, server) = serve_once(500, "{\"err\":true}");
        let workflow = Workflow {
            id: "w".into(),
            name: "branch".into(),
            nodes: vec![
                request_node("r", stored(&format!("http://{host}/x"), vec![])),
                WorkflowNode::Condition {
                    id: "c".into(),
                    expr: ConditionExpr::StatusEquals { expected: 200 },
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                WorkflowNode::Delay {
                    id: "yes".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                WorkflowNode::Delay {
                    id: "no".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
            ],
            edges: vec![
                WorkflowEdge {
                    from: "r".into(),
                    to: "c".into(),
                    branch: None,
                },
                WorkflowEdge {
                    from: "c".into(),
                    to: "yes".into(),
                    branch: Some(true),
                },
                WorkflowEdge {
                    from: "c".into(),
                    to: "no".into(),
                    branch: Some(false),
                },
            ],
        };

        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        let runner = direct_runner();
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));
        server.join().unwrap();

        let started_nodes: Vec<String> = events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.kind == WorkflowEventKind::Started)
            .filter_map(|e| e.node_id.clone())
            .collect();
        assert!(
            started_nodes.contains(&"no".to_string()),
            "false branch reached"
        );
        assert!(
            !started_nodes.contains(&"yes".to_string()),
            "true branch skipped"
        );
    }

    #[test]
    fn delay_node_measurably_delays_and_completes() {
        let workflow = Workflow {
            id: "w".into(),
            name: "delay".into(),
            nodes: vec![WorkflowNode::Delay {
                id: "d".into(),
                ms: 60,
                position: NodePosition { x: 0.0, y: 0.0 },
            }],
            edges: vec![],
        };
        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        let runner = direct_runner();
        let began = Instant::now();
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));
        assert!(
            began.elapsed() >= Duration::from_millis(50),
            "delay was applied"
        );
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.message.as_deref() == Some("run complete")));
    }

    #[test]
    fn step_limit_guard_stops_an_infinite_condition_loop() {
        // A Condition that always evaluates true and whose true-branch loops back
        // to itself would spin forever without the step guard.
        let workflow = Workflow {
            id: "w".into(),
            name: "loop".into(),
            nodes: vec![
                request_node("r", stored("http://127.0.0.1:1/x", vec![])), // unused start
                WorkflowNode::Condition {
                    id: "c".into(),
                    expr: ConditionExpr::StatusInRange { min: 0, max: 65000 },
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
            ],
            edges: vec![
                WorkflowEdge {
                    from: "r".into(),
                    to: "c".into(),
                    branch: None,
                },
                // true-branch loops the condition back to itself.
                WorkflowEdge {
                    from: "c".into(),
                    to: "c".into(),
                    branch: Some(true),
                },
            ],
        };
        // Runner returns a synthetic 200 without any network so the condition's
        // status range is always true and the loop relies on the step guard.
        let runner: Box<RunRequestFn<'static>> = Box::new(|_node, _vars| {
            Box::pin(async move {
                Ok(ResponseData {
                    request_id: "x".into(),
                    status: 200,
                    http_version: "1.1".into(),
                    headers: vec![],
                    body: "{}".into(),
                    body_is_base64: false,
                    body_truncated_at: None,
                    size_download_bytes: 2,
                    timings: Timings::default(),
                    effective_url: "http://x/".into(),
                    redirect_chain: vec![],
                    verbose_log: String::new(),
                    tls: None,
                })
            })
        });

        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));

        let failed = events
            .lock()
            .unwrap()
            .iter()
            .find(|e| e.kind == WorkflowEventKind::Failed)
            .and_then(|e| e.message.clone());
        assert!(
            failed
                .as_deref()
                .map(|m| m.contains("step limit"))
                .unwrap_or(false),
            "step limit failure expected, got: {failed:?}"
        );
    }

    #[test]
    fn missing_extract_path_halts_the_run() {
        let (host, server) = serve_once(200, "{\"id\":\"abc\"}");
        let workflow = Workflow {
            id: "w".into(),
            name: "bad-extract".into(),
            nodes: vec![
                request_node("a", stored(&format!("http://{host}/a"), vec![])),
                WorkflowNode::Extract {
                    id: "x".into(),
                    source: "$.does.not.exist".into(),
                    var_name: "v".into(),
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
            ],
            edges: vec![WorkflowEdge {
                from: "a".into(),
                to: "x".into(),
                branch: None,
            }],
        };
        let (sink, events) = recording_sink();
        let (_tx, rx) = watch::channel(false);
        let runner = direct_runner();
        tauri::async_runtime::block_on(run_graph(&workflow, &sink, &runner, rx));
        server.join().unwrap();

        let failed = events
            .lock()
            .unwrap()
            .iter()
            .find(|e| e.kind == WorkflowEventKind::Failed)
            .and_then(|e| e.message.clone());
        assert!(
            failed
                .as_deref()
                .map(|m| m.contains("path not found"))
                .unwrap_or(false),
            "missing-path failure expected, got: {failed:?}"
        );
    }

    #[test]
    fn no_unique_start_node_fails_validation() {
        // Two nodes, no edges → two in-degree-0 nodes → ambiguous start.
        let workflow = Workflow {
            id: "w".into(),
            name: "ambiguous".into(),
            nodes: vec![
                WorkflowNode::Delay {
                    id: "a".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
                WorkflowNode::Delay {
                    id: "b".into(),
                    ms: 0,
                    position: NodePosition { x: 0.0, y: 0.0 },
                },
            ],
            edges: vec![],
        };
        assert!(validate_graph(&workflow).is_err());
        let _ = kinds; // silence unused-helper warning when a build trims tests
    }
}
