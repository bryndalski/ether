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
