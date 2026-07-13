//! HTTP engine on libcurl (crate `curl`). Owns request execution,
//! cancellation, cookie jars, redirects (with cross-host Authorization
//! strip), timings and the verbose transfer log.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use base64::Engine as _;
use curl::easy::{Easy2, Form, Handler, InfoType, List, WriteError};

use crate::models::{
    ApiKeyPlacement, Auth, Body, KeyValue, MultipartPart, RedirectHop, RequestSpec, ResponseData,
    Timings, TlsInfo,
};
use crate::{sigv4, store};

const MAX_BODY_BYTES: usize = 10 * 1024 * 1024;

/// Registry of in-flight requests keyed by correlation id. A request checks
/// its flag from the libcurl progress callback and aborts the transfer when
/// the flag flips to cancelled.
fn cancel_registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_cancel(id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    cancel_registry()
        .lock()
        .expect("cancel registry poisoned")
        .insert(id.to_string(), Arc::clone(&flag));
    flag
}

fn deregister_cancel(id: &str) {
    cancel_registry()
        .lock()
        .expect("cancel registry poisoned")
        .remove(id);
}

/// Execute a fully-resolved request through libcurl on a blocking thread.
#[tauri::command]
pub async fn execute_request(spec: RequestSpec) -> Result<ResponseData, String> {
    tauri::async_runtime::spawn_blocking(move || run(spec))
        .await
        .map_err(|join_error| format!("engine task panicked: {join_error}"))?
}

/// Synchronous request execution for non-Tauri callers (the `lok` CLI). Same
/// transfer + history-write as the async command, minus the `spawn_blocking`
/// hop — a single headless request needs no async runtime.
pub fn execute_sync(spec: RequestSpec) -> Result<ResponseData, String> {
    run(spec)
}

/// Cancel an in-flight request by its correlation id.
#[tauri::command]
pub fn cancel_request(request_id: String) -> Result<bool, String> {
    match cancel_registry()
        .lock()
        .expect("cancel registry poisoned")
        .get(&request_id)
    {
        Some(flag) => {
            flag.store(true, Ordering::SeqCst);
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Everything libcurl streams back for one transfer hop lands here.
struct Collector {
    cancel: Arc<AtomicBool>,
    body: Vec<u8>,
    total_received: u64,
    header_lines: Vec<String>,
    verbose_log: String,
}

impl Collector {
    fn new(cancel: Arc<AtomicBool>) -> Self {
        Self {
            cancel,
            body: Vec::new(),
            total_received: 0,
            header_lines: Vec::new(),
            verbose_log: String::new(),
        }
    }
}

impl Handler for Collector {
    fn write(&mut self, data: &[u8]) -> Result<usize, WriteError> {
        self.total_received += data.len() as u64;
        let remaining = MAX_BODY_BYTES.saturating_sub(self.body.len());
        if remaining > 0 {
            let take = remaining.min(data.len());
            self.body.extend_from_slice(&data[..take]);
        }
        // Report the full length so libcurl does not treat the cap as a
        // short write and abort the transfer.
        Ok(data.len())
    }

    fn header(&mut self, data: &[u8]) -> bool {
        let line = String::from_utf8_lossy(data);
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if !trimmed.is_empty() {
            self.header_lines.push(trimmed.to_string());
        }
        true
    }

    fn debug(&mut self, kind: InfoType, data: &[u8]) {
        let prefix = match kind {
            InfoType::Text => "* ",
            InfoType::HeaderIn => "< ",
            InfoType::HeaderOut => "> ",
            InfoType::DataIn | InfoType::DataOut | InfoType::SslDataIn | InfoType::SslDataOut => {
                return
            }
            _ => "* ",
        };
        for raw in String::from_utf8_lossy(data).split_inclusive('\n') {
            self.verbose_log.push_str(prefix);
            self.verbose_log.push_str(&redact_verbose_line(raw));
        }
    }

    fn progress(&mut self, _dltotal: f64, _dlnow: f64, _ultotal: f64, _ulnow: f64) -> bool {
        // Returning false aborts the transfer (CURLE_ABORTED_BY_CALLBACK).
        !self.cancel.load(Ordering::SeqCst)
    }
}

/// Sensitive header names whose values must never reach the verbose log.
const REDACTED_HEADERS: [&str; 5] = [
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
];

/// Redact secret header VALUES inside one verbose log line, case-insensitive
/// on the header name. Handles an optional curl verbose prefix ("> ", "< ",
/// "* ") so it is correct whether called before or after the prefix is added.
/// Non-header lines pass through untouched.
fn redact_verbose_line(line: &str) -> String {
    let (content, newline) = match line.strip_suffix('\n') {
        Some(rest) => (rest, "\n"),
        None => (line, ""),
    };
    let (prefix, header) = split_verbose_prefix(content);
    if let Some(colon) = header.find(':') {
        let name = header[..colon].trim().to_ascii_lowercase();
        if REDACTED_HEADERS.contains(&name.as_str()) {
            return format!("{prefix}{}: •••{newline}", &header[..colon]);
        }
    }
    line.to_string()
}

/// Peel a leading "> "/"< "/"* " verbose marker off a line, returning
/// (prefix, remainder). Absent a marker the prefix is empty.
fn split_verbose_prefix(line: &str) -> (&str, &str) {
    for marker in ["> ", "< ", "* "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return (&line[..marker.len()], rest);
        }
    }
    ("", line)
}

/// A redirect decision: where to go next and how.
struct RedirectPlan {
    next_url: String,
    method: String,
    drop_body: bool,
}

/// Decide the follow-up request for a 3xx, mirroring browser/curl semantics.
/// 307/308 preserve method and body; 301/302/303 downgrade to GET (303 always,
/// 301/302 for anything but HEAD, matching common client behaviour).
fn plan_redirect(status: u32, method: &str, location: &str) -> Option<RedirectPlan> {
    if !(300..400).contains(&status) || location.is_empty() {
        return None;
    }
    let upper = method.to_ascii_uppercase();
    let (next_method, drop_body) = match status {
        307 | 308 => (upper.clone(), false),
        303 => ("GET".to_string(), true),
        301 | 302 => {
            if upper == "HEAD" {
                ("HEAD".to_string(), false)
            } else {
                ("GET".to_string(), true)
            }
        }
        _ => return None,
    };
    Some(RedirectPlan {
        next_url: location.to_string(),
        method: next_method,
        drop_body,
    })
}

/// Resolve a possibly-relative Location against the current absolute URL.
fn resolve_location(current: &str, location: &str) -> String {
    if location.starts_with("http://") || location.starts_with("https://") {
        return location.to_string();
    }
    let (scheme_host, _) = split_scheme_host(current);
    if location.starts_with('/') {
        format!("{scheme_host}{location}")
    } else {
        // Strip the last path segment and append the relative reference.
        let base = current
            .rsplit_once('/')
            .map(|(head, _)| head)
            .unwrap_or(current);
        format!("{base}/{location}")
    }
}

/// Return ("scheme://host[:port]", host_authority) for a URL.
fn split_scheme_host(url: &str) -> (String, String) {
    let after_scheme = url.find("://").map(|i| i + 3).unwrap_or(0);
    let authority_end = url[after_scheme..]
        .find(['/', '?', '#'])
        .map(|i| after_scheme + i)
        .unwrap_or(url.len());
    (
        url[..authority_end].to_string(),
        url[after_scheme..authority_end].to_string(),
    )
}

fn same_host(a: &str, b: &str) -> bool {
    let (_, host_a) = split_scheme_host(a);
    let (_, host_b) = split_scheme_host(b);
    host_a.eq_ignore_ascii_case(&host_b)
}

/// Return the scheme ("https"/"http"/…) of an absolute URL, lowercased.
fn scheme_of(url: &str) -> &str {
    url.split_once("://")
        .map(|(scheme, _)| scheme)
        .unwrap_or("")
}

/// Decide whether Authorization must be dropped when following a redirect from
/// `prev_url` to `next_url`. Conservative: strip on any authority change and on
/// an HTTPS→HTTP downgrade even to the same authority, so a TLS downgrade can
/// never leak a Bearer/Basic credential in cleartext. Once stripped it stays
/// stripped for the rest of the chain (the caller latches the flag).
fn should_strip_auth(prev_url: &str, next_url: &str) -> bool {
    if !same_host(prev_url, next_url) {
        return true;
    }
    let prev_scheme = scheme_of(prev_url).to_ascii_lowercase();
    let next_scheme = scheme_of(next_url).to_ascii_lowercase();
    // Same authority but the transport got weaker: https → anything non-https.
    prev_scheme == "https" && next_scheme != "https"
}

/// Append enabled query params to a URL, percent-encoding key and value.
fn url_with_query(base: &str, params: &[KeyValue]) -> String {
    let enabled: Vec<&KeyValue> = params.iter().filter(|kv| kv.enabled).collect();
    if enabled.is_empty() {
        return base.to_string();
    }
    let mut url = base.to_string();
    let mut sep = if url.contains('?') { '&' } else { '?' };
    for kv in enabled {
        url.push(sep);
        url.push_str(&encode(&kv.name));
        url.push('=');
        url.push_str(&encode(&kv.value));
        sep = '&';
    }
    url
}

fn encode(value: &str) -> String {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

/// Base directory for on-disk app data. `ETHER_DATA_DIR` (or the legacy
/// `LOKOWKA_DATA_DIR` alias), when set, overrides the default so tests can
/// redirect writes into a temp dir instead of the real Application Support tree.
fn data_dir() -> Result<PathBuf, String> {
    if let Some(override_dir) =
        std::env::var_os("ETHER_DATA_DIR").or_else(|| std::env::var_os("LOKOWKA_DATA_DIR"))
    {
        return Ok(PathBuf::from(override_dir));
    }
    let home = dirs::home_dir().ok_or("cannot resolve home directory")?;
    Ok(home
        .join("Library")
        .join("Application Support")
        .join("com.bryndalski.ether"))
}

/// Path to the persistent cookie jar for a scope key, creating the directory.
fn cookie_jar_path(key: &str) -> Result<PathBuf, String> {
    let dir = data_dir()?.join("cookies");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cookie dir: {e}"))?;
    Ok(dir.join(format!("{}.txt", sanitize_scope(key))))
}

fn sanitize_scope(key: &str) -> String {
    key.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Headers that carry request auth; assembled once and re-applied per hop so
/// we can drop Authorization when the host changes.
struct AuthHeaders {
    authorization: Option<String>,
    others: Vec<(String, String)>,
    query_extra: Vec<(String, String)>,
}

fn build_auth(spec: &RequestSpec) -> Result<AuthHeaders, String> {
    let mut authorization = None;
    let mut others = Vec::new();
    let mut query_extra = Vec::new();
    match &spec.auth {
        Auth::None => {}
        Auth::Bearer { token } => authorization = Some(format!("Bearer {token}")),
        Auth::Basic { username, password } => {
            let raw = format!("{username}:{password}");
            let encoded = base64::engine::general_purpose::STANDARD.encode(raw);
            authorization = Some(format!("Basic {encoded}"));
        }
        Auth::ApiKey {
            name,
            value,
            placement,
        } => match placement {
            ApiKeyPlacement::Header => others.push((name.clone(), value.clone())),
            ApiKeyPlacement::Query => query_extra.push((name.clone(), value.clone())),
        },
        Auth::SigV4 {
            profile,
            region,
            service,
        } => {
            let creds = sigv4::load_profile(profile)?;
            let signed = sigv4::sign(spec, &creds, region, service)
                .map_err(|_| "SigV4 not wired yet".to_string())?;
            for (name, value) in signed {
                if name.eq_ignore_ascii_case("authorization") {
                    authorization = Some(value);
                } else {
                    others.push((name, value));
                }
            }
        }
    }
    Ok(AuthHeaders {
        authorization,
        others,
        query_extra,
    })
}

/// State that stays constant across redirect hops.
struct RequestPlan {
    spec: RequestSpec,
    auth: AuthHeaders,
    origin_url: String,
    cookie_jar: Option<PathBuf>,
}

fn run(spec: RequestSpec) -> Result<ResponseData, String> {
    let cancel = register_cancel(&spec.id);
    let result = run_inner(&spec, Arc::clone(&cancel));
    deregister_cancel(&spec.id);
    result
}

fn run_inner(spec: &RequestSpec, cancel: Arc<AtomicBool>) -> Result<ResponseData, String> {
    let auth = build_auth(spec)?;
    let base_query = {
        let mut q = spec.query_params.clone();
        for (name, value) in &auth.query_extra {
            q.push(KeyValue {
                name: name.clone(),
                value: value.clone(),
                enabled: true,
            });
        }
        q
    };
    let origin_url = url_with_query(&spec.url, &base_query);
    let cookie_jar = match &spec.options.cookie_jar {
        Some(key) => Some(cookie_jar_path(key)?),
        None => None,
    };
    let plan = RequestPlan {
        spec: spec.clone(),
        auth,
        origin_url: origin_url.clone(),
        cookie_jar,
    };

    let mut current_url = origin_url;
    let mut current_method = spec.method.to_ascii_uppercase();
    let mut drop_body = false;
    let mut auth_stripped = false;
    let mut redirect_chain: Vec<RedirectHop> = Vec::new();
    let mut aggregate_verbose = String::new();

    for _hop in 0..=plan.spec.options.max_redirects {
        // Latch the strip: once auth left the origin (cross-host or an
        // https→http downgrade) it must never come back for the rest of the
        // chain, even if a later hop lands back on the origin.
        if should_strip_auth(&plan.origin_url, &current_url) {
            auth_stripped = true;
        }
        let outcome = perform_hop(
            &plan,
            &current_url,
            &current_method,
            drop_body,
            !auth_stripped,
            Arc::clone(&cancel),
        )?;
        aggregate_verbose.push_str(&outcome.verbose_log);

        let redirect_allowed = plan.spec.options.follow_redirects
            && (redirect_chain.len() as u32) < plan.spec.options.max_redirects;
        let next = if redirect_allowed {
            outcome
                .location
                .as_ref()
                .map(|loc| resolve_location(&current_url, loc))
                .and_then(|resolved| plan_redirect(outcome.status, &current_method, &resolved))
        } else {
            None
        };

        match next {
            Some(step) => {
                // The strip happens on the transition INTO the next URL, so the
                // recorded hop reflects whether crossing to `step.next_url`
                // sheds credentials (cross-host or an https→http downgrade).
                let strips_here = should_strip_auth(&plan.origin_url, &step.next_url);
                redirect_chain.push(RedirectHop {
                    url: current_url.clone(),
                    status: outcome.status,
                    auth_stripped: strips_here,
                });
                current_url = step.next_url;
                current_method = step.method;
                drop_body = step.drop_body;
            }
            None => {
                let response = finalize(&plan, outcome, redirect_chain, aggregate_verbose)?;
                let entry = crate::models::HistoryEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    request_id: Some(plan.spec.id.clone()),
                    executed_at: chrono::Utc::now().to_rfc3339(),
                    request: plan.spec.clone(),
                    response: response.clone(),
                };
                let _ = store::history_add(&entry);
                return Ok(response);
            }
        }
    }

    Err(format!(
        "too many redirects (limit {})",
        plan.spec.options.max_redirects
    ))
}

/// Result of a single transfer hop before it is folded into ResponseData.
struct HopOutcome {
    status: u32,
    location: Option<String>,
    status_line: Option<String>,
    body: Vec<u8>,
    total_received: u64,
    response_headers: Vec<KeyValue>,
    verbose_log: String,
    timings: Timings,
    effective_url: String,
    verify_ok: bool,
}

fn perform_hop(
    plan: &RequestPlan,
    url: &str,
    method: &str,
    drop_body: bool,
    include_auth: bool,
    cancel: Arc<AtomicBool>,
) -> Result<HopOutcome, String> {
    let mut easy = Easy2::new(Collector::new(cancel));
    let options = &plan.spec.options;

    easy.url(url).map_err(curl_err)?;
    easy.follow_location(false).map_err(curl_err)?;
    easy.verbose(true).map_err(curl_err)?;
    easy.progress(true).map_err(curl_err)?;
    easy.timeout(std::time::Duration::from_millis(options.timeout_ms))
        .map_err(curl_err)?;

    if options.insecure {
        easy.ssl_verify_peer(false).map_err(curl_err)?;
        easy.ssl_verify_host(false).map_err(curl_err)?;
    }
    if let Some(ca) = &options.ca_bundle_path {
        easy.cainfo(ca).map_err(curl_err)?;
    }
    if options.compressed {
        easy.accept_encoding("").map_err(curl_err)?;
    }
    if let Some(jar) = &plan.cookie_jar {
        easy.cookie_file(jar).map_err(curl_err)?;
        easy.cookie_jar(jar).map_err(curl_err)?;
    }

    apply_method_and_body(&mut easy, plan, method, drop_body, include_auth)?;

    match easy.perform() {
        Ok(()) => {}
        Err(error) if error.is_aborted_by_callback() => {
            return Err("request cancelled".to_string());
        }
        Err(error) => return Err(curl_err(error)),
    }

    let status = easy.response_code().map_err(curl_err)?;
    let effective_url = easy
        .effective_url()
        .map_err(curl_err)?
        .unwrap_or(url)
        .to_string();
    let timings = collect_timings(&easy)?;
    // TLS verification only "succeeded" when we actually verified: an HTTPS
    // transfer completed with peer/host checks enabled. `insecure` skips those
    // checks, so it can never report verified; plain HTTP has no TLS at all.
    let verify_ok = !options.insecure && status != 0 && effective_url.starts_with("https://");

    let collector = easy.get_ref();
    let (status_line, response_headers, location) = parse_headers(&collector.header_lines);

    Ok(HopOutcome {
        status,
        location,
        status_line,
        body: collector.body.clone(),
        total_received: collector.total_received,
        response_headers,
        verbose_log: collector.verbose_log.clone(),
        timings,
        effective_url,
        verify_ok,
    })
}

/// Configure verb, body and request headers on the easy handle for one hop.
fn apply_method_and_body(
    easy: &mut Easy2<Collector>,
    plan: &RequestPlan,
    method: &str,
    drop_body: bool,
    include_auth: bool,
) -> Result<(), String> {
    let mut headers = List::new();
    let mut content_type: Option<String> = None;

    // A form (multipart) borrows part data, so it must outlive perform().
    let mut form: Option<Form> = None;
    let mut raw_body: Option<Vec<u8>> = None;

    if !drop_body {
        match &plan.spec.body {
            Body::None => {}
            Body::Raw {
                content_type: ct,
                text,
            } => {
                if !ct.is_empty() {
                    content_type = Some(ct.clone());
                }
                raw_body = Some(text.clone().into_bytes());
            }
            Body::FormUrlencoded { fields } => {
                content_type = Some("application/x-www-form-urlencoded".to_string());
                let encoded = fields
                    .iter()
                    .filter(|kv| kv.enabled)
                    .map(|kv| format!("{}={}", encode(&kv.name), encode(&kv.value)))
                    .collect::<Vec<_>>()
                    .join("&");
                raw_body = Some(encoded.into_bytes());
            }
            Body::Multipart { parts } => {
                form = Some(build_form(parts)?);
            }
        }
    }

    let verb = method.to_ascii_uppercase();
    if let Some(form) = form {
        easy.httppost(form).map_err(curl_err)?;
        if verb != "POST" {
            easy.custom_request(&verb).map_err(curl_err)?;
        }
    } else if let Some(bytes) = raw_body {
        easy.post(true).map_err(curl_err)?;
        easy.post_field_size(bytes.len() as u64).map_err(curl_err)?;
        easy.post_fields_copy(&bytes).map_err(curl_err)?;
        // Only override the verb for non-POST bodied requests (PUT/PATCH/…);
        // for a plain POST, easy.post(true) already sets it and CUSTOMREQUEST
        // is a known libcurl footgun.
        if verb != "POST" {
            easy.custom_request(&verb).map_err(curl_err)?;
        }
    } else {
        match verb.as_str() {
            "GET" => easy.get(true).map_err(curl_err)?,
            "HEAD" => easy.nobody(true).map_err(curl_err)?,
            _ => easy.custom_request(&verb).map_err(curl_err)?,
        }
    }

    for kv in plan.spec.headers.iter().filter(|kv| kv.enabled) {
        headers
            .append(&format!("{}: {}", kv.name, kv.value))
            .map_err(curl_err)?;
    }
    if include_auth {
        if let Some(value) = &plan.auth.authorization {
            headers
                .append(&format!("Authorization: {value}"))
                .map_err(curl_err)?;
        }
    }
    for (name, value) in &plan.auth.others {
        headers
            .append(&format!("{name}: {value}"))
            .map_err(curl_err)?;
    }
    if let Some(ct) = content_type {
        headers
            .append(&format!("Content-Type: {ct}"))
            .map_err(curl_err)?;
    }
    easy.http_headers(headers).map_err(curl_err)?;
    Ok(())
}

fn build_form(parts: &[MultipartPart]) -> Result<Form, String> {
    let mut form = Form::new();
    for part in parts {
        match part {
            MultipartPart::Text { name, value } => {
                form.part(name)
                    .contents(value.as_bytes())
                    .add()
                    .map_err(|e| format!("multipart text part: {e}"))?;
            }
            MultipartPart::File {
                name,
                path,
                content_type,
            } => {
                let mut builder = form.part(name);
                builder.file(path);
                if let Some(ct) = content_type {
                    builder.content_type(ct);
                }
                builder
                    .add()
                    .map_err(|e| format!("multipart file part: {e}"))?;
            }
        }
    }
    Ok(form)
}

fn collect_timings(easy: &Easy2<Collector>) -> Result<Timings, String> {
    let ms = |d: std::time::Duration| d.as_secs_f64() * 1000.0;
    let dns = ms(easy.namelookup_time().map_err(curl_err)?);
    let connect = ms(easy.connect_time().map_err(curl_err)?);
    let appconnect = ms(easy.appconnect_time().map_err(curl_err)?);
    let starttransfer = ms(easy.starttransfer_time().map_err(curl_err)?);
    let total = ms(easy.total_time().map_err(curl_err)?);
    // TLS handshake is the span between TCP connect and the secured connection.
    let tls = if appconnect > 0.0 {
        (appconnect - connect).max(0.0)
    } else {
        0.0
    };
    Ok(Timings {
        dns_ms: dns,
        connect_ms: (connect - dns).max(0.0),
        tls_ms: tls,
        ttfb_ms: starttransfer,
        total_ms: total,
    })
}

/// Split header lines into (status line, header pairs, Location value).
fn parse_headers(lines: &[String]) -> (Option<String>, Vec<KeyValue>, Option<String>) {
    let mut status_line = None;
    let mut headers = Vec::new();
    let mut location = None;
    for line in lines {
        if line.starts_with("HTTP/") {
            // Keep the last status line so redirect intermediates are replaced.
            status_line = Some(line.clone());
            headers.clear();
            location = None;
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            let name = name.trim().to_string();
            let value = value.trim().to_string();
            if name.eq_ignore_ascii_case("location") {
                location = Some(value.clone());
            }
            headers.push(KeyValue {
                name,
                value,
                enabled: true,
            });
        }
    }
    (status_line, headers, location)
}

/// Extract "HTTP/x" from a status line like "HTTP/1.1 200 OK".
fn http_version_from_status(status_line: &Option<String>) -> String {
    status_line
        .as_ref()
        .and_then(|line| line.split_whitespace().next())
        .unwrap_or("HTTP/1.1")
        .to_string()
}

fn finalize(
    plan: &RequestPlan,
    outcome: HopOutcome,
    redirect_chain: Vec<RedirectHop>,
    verbose_log: String,
) -> Result<ResponseData, String> {
    let http_version = http_version_from_status(&outcome.status_line);
    let (body, body_is_base64, body_truncated_at) =
        encode_body(&outcome.body, outcome.total_received);

    let tls = if plan.origin_url.starts_with("https://")
        || outcome.effective_url.starts_with("https://")
    {
        Some(TlsInfo {
            protocol: None,
            cipher: None,
            verify_ok: outcome.verify_ok,
            cert_chain: Vec::new(),
        })
    } else {
        None
    };

    Ok(ResponseData {
        request_id: plan.spec.id.clone(),
        status: outcome.status,
        http_version,
        headers: outcome.response_headers,
        body,
        body_is_base64,
        body_truncated_at,
        size_download_bytes: outcome.total_received,
        timings: outcome.timings,
        effective_url: outcome.effective_url,
        redirect_chain,
        verbose_log,
        tls,
    })
}

/// Encode the captured body: UTF-8 when possible, base64 otherwise; report the
/// truncation cap when the transfer exceeded the in-memory limit.
fn encode_body(captured: &[u8], total_received: u64) -> (String, bool, Option<u64>) {
    let truncated_at = if total_received > MAX_BODY_BYTES as u64 {
        Some(MAX_BODY_BYTES as u64)
    } else {
        None
    };
    match std::str::from_utf8(captured) {
        Ok(text) => (text.to_string(), false, truncated_at),
        Err(_) => (
            base64::engine::general_purpose::STANDARD.encode(captured),
            true,
            truncated_at,
        ),
    }
}

fn curl_err(error: curl::Error) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_authorization_value() {
        let out = redact_verbose_line("> Authorization: Bearer supersecret\n");
        assert_eq!(out, "> Authorization: •••\n");
    }

    #[test]
    fn redaction_is_case_insensitive() {
        let out = redact_verbose_line("< set-cookie: session=abc123\r\n");
        assert!(out.contains("•••"));
        assert!(!out.contains("abc123"));
    }

    #[test]
    fn redaction_leaves_normal_headers_intact() {
        let line = "< Content-Type: application/json\n";
        assert_eq!(redact_verbose_line(line), line);
    }

    #[test]
    fn redacts_x_api_key_and_cookie() {
        assert!(redact_verbose_line("> X-Api-Key: k\n").contains("•••"));
        assert!(redact_verbose_line("> Cookie: a=b\n").contains("•••"));
        assert!(redact_verbose_line("> Proxy-Authorization: x\n").contains("•••"));
    }

    #[test]
    fn redaction_ignores_verbose_text_lines() {
        let line = "* Trying 127.0.0.1:80...\n";
        assert_eq!(redact_verbose_line(line), line);
    }

    #[test]
    fn redirect_303_downgrades_post_to_get() {
        let plan = plan_redirect(303, "POST", "http://x/next").unwrap();
        assert_eq!(plan.method, "GET");
        assert!(plan.drop_body);
    }

    #[test]
    fn redirect_307_preserves_method_and_body() {
        let plan = plan_redirect(307, "POST", "http://x/next").unwrap();
        assert_eq!(plan.method, "POST");
        assert!(!plan.drop_body);
    }

    #[test]
    fn redirect_308_preserves_put() {
        let plan = plan_redirect(308, "PUT", "http://x/next").unwrap();
        assert_eq!(plan.method, "PUT");
        assert!(!plan.drop_body);
    }

    #[test]
    fn redirect_301_downgrades_post_to_get() {
        let plan = plan_redirect(301, "POST", "http://x/next").unwrap();
        assert_eq!(plan.method, "GET");
        assert!(plan.drop_body);
    }

    #[test]
    fn non_3xx_has_no_redirect_plan() {
        assert!(plan_redirect(200, "GET", "http://x/next").is_none());
        assert!(plan_redirect(302, "GET", "").is_none());
    }

    #[test]
    fn same_host_ignores_scheme_and_path() {
        assert!(same_host("http://a.test/x", "http://a.test/y?q=1"));
        assert!(!same_host("http://a.test/x", "http://b.test/x"));
    }

    #[test]
    fn strip_auth_on_cross_host() {
        assert!(should_strip_auth("https://a.test/x", "https://b.test/x"));
        assert!(should_strip_auth("http://a.test/x", "http://b.test/x"));
    }

    #[test]
    fn keep_auth_same_host_same_scheme() {
        assert!(!should_strip_auth("https://a.test/x", "https://a.test/y"));
        assert!(!should_strip_auth("http://a.test/x", "http://a.test/y?q=1"));
    }

    #[test]
    fn strip_auth_on_https_to_http_downgrade_same_host() {
        assert!(should_strip_auth("https://a.test/x", "http://a.test/x"));
    }

    #[test]
    fn keep_auth_on_http_to_https_upgrade() {
        assert!(!should_strip_auth("http://a.test/x", "https://a.test/x"));
    }

    #[test]
    fn strip_auth_same_host_different_port() {
        // Conservative: a different port is a different authority.
        assert!(should_strip_auth(
            "https://a.test:8443/x",
            "https://a.test:9443/x"
        ));
        assert!(should_strip_auth("http://a.test/x", "http://a.test:8080/x"));
    }

    #[test]
    fn resolve_location_handles_absolute_and_relative() {
        assert_eq!(
            resolve_location("http://a.test/dir/x", "http://b.test/y"),
            "http://b.test/y"
        );
        assert_eq!(
            resolve_location("http://a.test/dir/x", "/root"),
            "http://a.test/root"
        );
        assert_eq!(
            resolve_location("http://a.test/dir/x", "sibling"),
            "http://a.test/dir/sibling"
        );
    }

    #[test]
    fn query_params_percent_encode_and_skip_disabled() {
        let params = vec![
            KeyValue {
                name: "q".into(),
                value: "a b".into(),
                enabled: true,
            },
            KeyValue {
                name: "skip".into(),
                value: "x".into(),
                enabled: false,
            },
        ];
        let url = url_with_query("http://a.test/p", &params);
        assert_eq!(url, "http://a.test/p?q=a%20b");
    }

    #[test]
    fn encode_body_flags_binary_as_base64() {
        let (encoded, is_b64, _) = encode_body(&[0xff, 0xfe, 0x00], 3);
        assert!(is_b64);
        assert!(!encoded.is_empty());
    }

    #[test]
    fn encode_body_reports_truncation() {
        let (_, _, truncated) = encode_body(b"partial", (MAX_BODY_BYTES as u64) + 10);
        assert_eq!(truncated, Some(MAX_BODY_BYTES as u64));
    }

    // Serialize the env-var mutating tests: they share the process environment.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn data_dir_defaults_to_ether_namespace() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("ETHER_DATA_DIR");
        std::env::remove_var("LOKOWKA_DATA_DIR");
        let dir = data_dir().unwrap();
        assert!(
            dir.ends_with("com.bryndalski.ether"),
            "default data dir must live under the ether namespace, got {dir:?}"
        );
    }

    #[test]
    fn data_dir_honours_ether_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("LOKOWKA_DATA_DIR");
        std::env::set_var("ETHER_DATA_DIR", "/tmp/ether-test-dir");
        let dir = data_dir().unwrap();
        std::env::remove_var("ETHER_DATA_DIR");
        assert_eq!(dir, PathBuf::from("/tmp/ether-test-dir"));
    }

    #[test]
    fn data_dir_honours_legacy_lokowka_override_alias() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("ETHER_DATA_DIR");
        std::env::set_var("LOKOWKA_DATA_DIR", "/tmp/legacy-lokowka-dir");
        let dir = data_dir().unwrap();
        std::env::remove_var("LOKOWKA_DATA_DIR");
        assert_eq!(dir, PathBuf::from("/tmp/legacy-lokowka-dir"));
    }
}
