// TypeScript mirror of src-tauri/src/models.rs. Field names and serde tags
// must stay 1:1 with the Rust contract — the Tauri IPC boundary serializes by
// these exact names. `Body` and `Auth` are internally-tagged with the serde
// `type` discriminator (rename_all = "snake_case"); MultipartPart uses `kind`.

export interface KeyValue {
  name: string;
  value: string;
  enabled: boolean;
}

export type Body =
  | { type: "none" }
  | { type: "raw"; content_type: string; text: string }
  | { type: "form_urlencoded"; fields: KeyValue[] }
  | { type: "multipart"; parts: MultipartPart[] };

export type MultipartPart =
  | { kind: "text"; name: string; value: string }
  | { kind: "file"; name: string; path: string; content_type: string | null };

export type ApiKeyPlacement = "header" | "query";

export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "api_key"; name: string; value: string; placement: ApiKeyPlacement }
  | { type: "sig_v4"; profile: string; region: string; service: string };

export interface RequestOptions {
  follow_redirects: boolean;
  max_redirects: number;
  timeout_ms: number;
  insecure: boolean;
  ca_bundle_path: string | null;
  compressed: boolean;
  cookie_jar: string | null;
}

export interface RequestSpec {
  id: string;
  method: string;
  url: string;
  headers: KeyValue[];
  query_params: KeyValue[];
  body: Body;
  auth: Auth;
  options: RequestOptions;
}

export interface Timings {
  dns_ms: number;
  connect_ms: number;
  tls_ms: number;
  ttfb_ms: number;
  total_ms: number;
}

export interface RedirectHop {
  url: string;
  status: number;
  auth_stripped: boolean;
}

export interface TlsInfo {
  protocol: string | null;
  cipher: string | null;
  verify_ok: boolean;
  cert_chain: string[];
}

export interface ResponseData {
  request_id: string;
  status: number;
  http_version: string;
  headers: KeyValue[];
  body: string;
  body_is_base64: boolean;
  body_truncated_at: number | null;
  size_download_bytes: number;
  timings: Timings;
  effective_url: string;
  redirect_chain: RedirectHop[];
  verbose_log: string;
  tls: TlsInfo | null;
}

export interface Collection {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  docs_md: string | null;
}

export interface GraphqlMeta {
  operation_type: string;
  query: string;
  variables_json: string;
}

export interface StoredRequest {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  headers: KeyValue[];
  query_params: KeyValue[];
  body: Body;
  auth: Auth;
  options: RequestOptions;
  sort_order: number;
  docs_md: string | null;
  graphql: GraphqlMeta | null;
}

export interface Environment {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  variables: KeyValue[];
  secret_names: string[];
}

export interface HistoryEntry {
  id: string;
  request_id: string | null;
  executed_at: string;
  request: RequestSpec;
  response: ResponseData;
}

export interface ImportResult {
  collections: Collection[];
  requests: StoredRequest[];
  environments: Environment[];
  warnings: string[];
}

/** The five env kinds the design system colors via [data-env]. */
export type EnvKind = "local" | "dev" | "staging" | "prod" | "custom";

export type Theme = "dark" | "light";
