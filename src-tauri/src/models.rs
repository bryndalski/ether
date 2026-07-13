//! Shared data contract between the frontend, the store and the HTTP engine.
//! Every parallel work stream builds against these types — change them only
//! via a dedicated PR touching this file alone.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyValue {
    pub name: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Body {
    None,
    /// Raw text body with an explicit content type (JSON, XML, plain…).
    Raw {
        content_type: String,
        text: String,
    },
    FormUrlencoded {
        fields: Vec<KeyValue>,
    },
    Multipart {
        parts: Vec<MultipartPart>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MultipartPart {
    Text {
        name: String,
        value: String,
    },
    File {
        name: String,
        /// Absolute path on disk; the engine streams it.
        path: String,
        content_type: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Auth {
    None,
    Bearer {
        token: String,
    },
    Basic {
        username: String,
        password: String,
    },
    ApiKey {
        name: String,
        value: String,
        placement: ApiKeyPlacement,
    },
    /// AWS Signature V4 — credentials resolved from ~/.aws by profile name.
    SigV4 {
        profile: String,
        region: String,
        service: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ApiKeyPlacement {
    Header,
    Query,
}

/// A declarative, scriptless response assertion. Evaluated on the FRONTEND
/// (pure `evalAssertions`); Rust only persists it verbatim with the request.
/// Internally tagged like Body/Auth so the TS mirror stays a 1:1 union.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Assertion {
    StatusEquals {
        expected: u16,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    StatusInRange {
        min: u16,
        max: u16,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    HeaderExists {
        name: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    HeaderEquals {
        name: String,
        expected: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    JsonPathExists {
        path: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    JsonPathEquals {
        path: String,
        expected: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    JsonPathType {
        path: String,
        // Rust never evaluates the type; keeping it a String avoids a second
        // enum that must mirror the TS `JsonType` union. The FE narrows it.
        expected_type: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    BodyContains {
        substring: String,
        #[serde(default = "default_true")]
        enabled: bool,
    },
    ResponseTimeBelow {
        max_ms: f64,
        #[serde(default = "default_true")]
        enabled: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestOptions {
    #[serde(default = "default_true")]
    pub follow_redirects: bool,
    #[serde(default = "default_max_redirs")]
    pub max_redirects: u32,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    /// Skip TLS verification (curl --insecure). UI must warn loudly.
    #[serde(default)]
    pub insecure: bool,
    /// Optional custom CA bundle path (curl --cacert).
    #[serde(default)]
    pub ca_bundle_path: Option<String>,
    /// Accept compressed responses (curl --compressed).
    #[serde(default = "default_true")]
    pub compressed: bool,
    /// Cookie jar scope key — normally the active environment id.
    #[serde(default)]
    pub cookie_jar: Option<String>,
}

impl Default for RequestOptions {
    fn default() -> Self {
        Self {
            follow_redirects: true,
            max_redirects: default_max_redirs(),
            timeout_ms: default_timeout(),
            insecure: false,
            ca_bundle_path: None,
            compressed: true,
            cookie_jar: None,
        }
    }
}

fn default_max_redirs() -> u32 {
    10
}

fn default_timeout() -> u64 {
    30_000
}

/// A fully-resolved request as executed by the engine. Interpolation of
/// {{env.x}} / {{secret.x}} / {{$dynamic}} happens BEFORE this struct is
/// handed to the engine; the engine never sees template syntax.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestSpec {
    /// Correlation id used for cancellation and history.
    pub id: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub query_params: Vec<KeyValue>,
    pub body: Body,
    pub auth: Auth,
    #[serde(default)]
    pub options: RequestOptions,
}

/// Per-phase timings in milliseconds, mapped 1:1 from libcurl's getinfo.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Timings {
    pub dns_ms: f64,
    pub connect_ms: f64,
    pub tls_ms: f64,
    pub ttfb_ms: f64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RedirectHop {
    pub url: String,
    pub status: u32,
    /// True when the engine stripped Authorization crossing hosts.
    pub auth_stripped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResponseData {
    pub request_id: String,
    pub status: u32,
    pub http_version: String,
    pub headers: Vec<KeyValue>,
    /// UTF-8 body up to `body_truncated_at`; binary bodies are base64-encoded
    /// and flagged via `body_is_base64`.
    pub body: String,
    pub body_is_base64: bool,
    /// Set when the body preview was capped; full body may be saved to file.
    pub body_truncated_at: Option<u64>,
    pub size_download_bytes: u64,
    pub timings: Timings,
    pub effective_url: String,
    pub redirect_chain: Vec<RedirectHop>,
    /// curl -v style transfer log with secrets redacted.
    pub verbose_log: String,
    pub tls: Option<TlsInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TlsInfo {
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub verify_ok: bool,
    /// PEM chain when available (for the certificate viewer).
    pub cert_chain: Vec<String>,
}

// ---------- persistence-level entities (SQLite) ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub docs_md: Option<String>,
}

/// A stored (unresolved) request — may contain {{template}} syntax anywhere.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoredRequest {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub query_params: Vec<KeyValue>,
    pub body: Body,
    pub auth: Auth,
    #[serde(default)]
    pub options: RequestOptions,
    pub sort_order: i64,
    pub docs_md: Option<String>,
    /// GraphQL requests carry operation metadata for the explorer.
    pub graphql: Option<GraphqlMeta>,
    /// Scriptless response assertions that travel with the request definition.
    /// `#[serde(default)]` back-fills `[]` for any pre-migration payload.
    #[serde(default)]
    pub assertions: Vec<Assertion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GraphqlMeta {
    pub operation_type: String,
    pub query: String,
    pub variables_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Environment {
    pub id: String,
    pub name: String,
    /// Base environment this one inherits from (None = it is a base).
    pub parent_id: Option<String>,
    pub color: Option<String>,
    /// Public (commit-safe) variables.
    pub variables: Vec<KeyValue>,
    /// Names of variables whose VALUES live in the macOS Keychain.
    pub secret_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HistoryEntry {
    pub id: String,
    pub request_id: Option<String>,
    pub executed_at: String,
    pub request: RequestSpec,
    pub response: ResponseData,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ImportResult {
    pub collections: Vec<Collection>,
    pub requests: Vec<StoredRequest>,
    pub environments: Vec<Environment>,
    pub warnings: Vec<String>,
}

/// Which non-deterministic fields to scrub before a snapshot compare. Stored as
/// `snapshots.scrub_paths_json`; the FE owns the actual scrubbing (pure lib).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ScrubConfig {
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub auto_timestamps: bool,
    #[serde(default)]
    pub auto_uuids: bool,
}

/// A saved response baseline for a request (one per request). A distinct
/// persistence entity — saved / accepted / deleted independently of the request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotRecord {
    pub request_id: String,
    /// Serialized to `snapshots.baseline_json`.
    pub baseline: ResponseData,
    /// Serialized to `snapshots.scrub_paths_json`.
    pub scrub_config: ScrubConfig,
    pub created_at: String,
}

// ---------- workflow graph (SQLite: `workflows` table, graph_json) ----------

/// A saved workflow graph: an addressable set of nodes + directed edges. The
/// whole graph serializes to `workflows.graph_json` as ONE blob (matches the
/// `snapshots.baseline_json` convention — the graph is edited/saved atomically,
/// never queried by sub-field, so a single JSON column is correct here).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub nodes: Vec<WorkflowNode>,
    #[serde(default)]
    pub edges: Vec<WorkflowEdge>,
}

/// Canvas coordinates for a node (React Flow's `position`). Kept on every node
/// variant so the graph round-trips through the store without a side table.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

/// One node in the graph. Internally tagged on `"kind"` (same convention as
/// `Body`/`Auth`/`Assertion`) so the TS mirror stays a 1:1 discriminated union.
/// Every variant carries `id` (graph-unique, distinct from any StoredRequest id)
/// and `position`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkflowNode {
    /// Execute a request. Either references an existing StoredRequest by id, or
    /// carries an inline one (so a workflow is self-contained / exportable).
    Request {
        id: String,
        #[serde(flatten)]
        source: RequestSource,
        position: NodePosition,
    },
    /// Pull a JSONPath value out of the PREVIOUS request node's response and bind
    /// it to a run-scoped variable named `var_name`. Referenced downstream as
    /// `{{var.var_name}}`.
    Extract {
        id: String,
        /// JSONPath into the last response body (same grammar as `resolveJsonPath`).
        source: String,
        var_name: String,
        position: NodePosition,
    },
    /// Branch. Evaluates a small predicate against the last response; the run
    /// then follows the outgoing edge whose `branch` matches the boolean result.
    Condition {
        id: String,
        expr: ConditionExpr,
        position: NodePosition,
    },
    /// Pause the run for `ms` milliseconds (bounded by the executor's wall clock).
    Delay {
        id: String,
        ms: u64,
        position: NodePosition,
    },
}

impl WorkflowNode {
    /// The graph-unique id, regardless of variant.
    pub fn id(&self) -> &str {
        match self {
            WorkflowNode::Request { id, .. }
            | WorkflowNode::Extract { id, .. }
            | WorkflowNode::Condition { id, .. }
            | WorkflowNode::Delay { id, .. } => id,
        }
    }
}

/// A request node's payload: a reference to a saved request, or an inline copy.
/// Untagged so the JSON is `{ "request_ref": "id" }` XOR `{ "request": {...} }`.
/// The inline request is boxed so this enum stays small (a `StoredRequest` is
/// ~480 bytes vs a bare id — boxing avoids bloating every non-inline node).
/// `Box` is serde-transparent, so the wire/JSON shape is unchanged.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RequestSource {
    RequestRef(String),          // id of an existing StoredRequest
    Request(Box<StoredRequest>), // inline, self-contained
}

/// A tiny, NON-Turing-complete condition. Deliberately closed (same philosophy as
/// interp.rs / Assertion) — never an eval()/expression engine. v1 covers the two
/// cases the prompt calls out: `status == N` and a JSONPath exists/equals check.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConditionExpr {
    /// True when the last response status equals `expected`.
    StatusEquals { expected: u16 },
    /// True when the last response status is in [min, max].
    StatusInRange { min: u16, max: u16 },
    /// True when a JSONPath resolves to a present node (a present `null` counts).
    JsonPathExists { path: String },
    /// True when the JSONPath node string-matches `expected` (lenient coercion,
    /// same rule as `valueMatchesExpected` in assertions.ts: "200"↔200, "true"↔true).
    JsonPathEquals { path: String, expected: String },
}

/// A directed edge. `branch` is Some(true)/Some(false) ONLY on edges leaving a
/// ConditionNode (the true/false arms); None for every ordinary sequential edge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowEdge {
    pub from: String, // node id
    pub to: String,   // node id
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<bool>,
}
