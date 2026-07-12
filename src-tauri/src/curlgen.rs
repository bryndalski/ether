//! Two-way curl round-trip: RequestSpec -> curl command (1:1 with what the
//! engine executes) and curl command -> RequestSpec (tolerant parser).
//! `redact: true` masks secret values for clipboard/sharing.
//!
//! The whole feature is the brand promise "request 1:1 = curl": the string
//! `to_curl` emits must reproduce exactly the transfer `engine.rs` performs —
//! same URL (query already folded in), same headers, same body encoding, same
//! auth, same TLS/redirect/timeout options. `from_curl` is the inverse and is
//! deliberately tolerant so a command pasted from browser DevTools (multi-line,
//! quoted, with flags we do not model) parses instead of erroring.

use crate::models::{
    ApiKeyPlacement, Auth, Body, KeyValue, MultipartPart, RequestOptions, RequestSpec,
};

/// Placeholder shown in place of a secret value when `redact` is on.
const REDACTED: &str = "•••";

/// Header names whose values are secrets and get masked under `redact`.
const SECRET_HEADERS: [&str; 4] = [
    "authorization",
    "cookie",
    "x-api-key",
    "proxy-authorization",
];

/// Parameter/field names that look secret and get masked under `redact`.
const SECRET_NAME_HINTS: [&str; 3] = ["token", "password", "haslo"];

// ============================ RequestSpec -> curl ============================

#[tauri::command]
pub fn to_curl(spec: RequestSpec, redact: bool) -> Result<String, String> {
    Ok(build_curl(&spec, redact))
}

/// Build the multi-line curl command. Each flag sits on its own line joined by
/// a trailing `\` so the output stays readable and pastes back into a shell.
fn build_curl(spec: &RequestSpec, redact: bool) -> String {
    let mut flags: Vec<String> = Vec::new();

    // Method: curl defaults to GET, so -X is redundant (and can even confuse
    // libcurl) for a plain GET. Emit it for everything else.
    let method = spec.method.to_ascii_uppercase();
    if method != "GET" {
        flags.push(format!("-X {}", shell_quote(&method)));
    }

    // URL carries the enabled query params exactly as the engine folds them in,
    // plus any ApiKey-in-query value.
    let url = full_url(spec, redact);
    flags.push(format!("--url {}", shell_quote(&url)));

    // Explicit headers (enabled only), redacting secret values.
    for header in spec.headers.iter().filter(|kv| kv.enabled) {
        let value = maybe_redact_header(&header.name, &header.value, redact);
        flags.push(format!(
            "-H {}",
            shell_quote(&format!("{}: {}", header.name, value))
        ));
    }

    push_auth_flags(&mut flags, &spec.auth, redact);
    push_body_flags(&mut flags, &spec.body, redact);
    push_option_flags(&mut flags, &spec.options);

    format!("curl {}", flags.join(" \\\n     "))
}

/// The URL the engine actually hits: base + enabled query params + an
/// ApiKey-in-query pair, each percent-encoded the same way the engine does.
fn full_url(spec: &RequestSpec, redact: bool) -> String {
    let mut params: Vec<(String, String)> = spec
        .query_params
        .iter()
        .filter(|kv| kv.enabled)
        .map(|kv| (kv.name.clone(), kv.value.clone()))
        .collect();

    if let Auth::ApiKey {
        name,
        value,
        placement: ApiKeyPlacement::Query,
    } = &spec.auth
    {
        let shown = if redact {
            REDACTED.to_string()
        } else {
            value.clone()
        };
        params.push((name.clone(), shown));
    }

    if params.is_empty() {
        return spec.url.clone();
    }

    let mut url = spec.url.clone();
    let mut sep = if url.contains('?') { '&' } else { '?' };
    for (name, value) in params {
        url.push(sep);
        url.push_str(&percent_encode(&name));
        url.push('=');
        // A redacted value must stay a literal placeholder, not get encoded.
        if value == REDACTED {
            url.push_str(REDACTED);
        } else {
            url.push_str(&percent_encode(&value));
        }
        sep = '&';
    }
    url
}

/// Emit auth flags matching how the engine assembles auth headers.
fn push_auth_flags(flags: &mut Vec<String>, auth: &Auth, redact: bool) {
    match auth {
        Auth::None => {}
        Auth::Bearer { token } => {
            let shown = if redact {
                REDACTED.to_string()
            } else {
                token.clone()
            };
            flags.push(format!(
                "-H {}",
                shell_quote(&format!("Authorization: Bearer {shown}"))
            ));
        }
        Auth::Basic { username, password } => {
            // curl -u user:pass — the engine base64s the same credentials into
            // Authorization: Basic. -u reproduces that transfer exactly.
            let shown_password = if redact {
                REDACTED.to_string()
            } else {
                password.clone()
            };
            flags.push(format!(
                "-u {}",
                shell_quote(&format!("{username}:{shown_password}"))
            ));
        }
        Auth::ApiKey {
            name,
            value,
            placement,
        } => {
            if let ApiKeyPlacement::Header = placement {
                let shown = if redact {
                    REDACTED.to_string()
                } else {
                    value.clone()
                };
                flags.push(format!("-H {}", shell_quote(&format!("{name}: {shown}"))));
            }
            // Query placement is already folded into the URL by full_url().
        }
        Auth::SigV4 {
            profile,
            region,
            service,
        } => {
            // We cannot reproduce a live signature offline, so we leave a
            // faithful marker: a comment plus the canonical signed headers the
            // engine adds. Signature value is intentionally a placeholder.
            flags.push(format!(
                "# signed with AWS SigV4 (profile {profile}, region {region}, service {service})"
            ));
            flags.push(format!(
                "-H {}",
                shell_quote("X-Amz-Content-Sha256: <computed>")
            ));
            flags.push(format!("-H {}", shell_quote("X-Amz-Date: <computed>")));
            flags.push(format!(
                "-H {}",
                shell_quote(&format!(
                    "Authorization: AWS4-HMAC-SHA256 Credential=<profile {profile}>/…, SignedHeaders=…, Signature=…"
                ))
            ));
        }
    }
}

/// Emit body flags mirroring the engine's body encoding.
fn push_body_flags(flags: &mut Vec<String>, body: &Body, redact: bool) {
    match body {
        Body::None => {}
        Body::Raw { content_type, text } => {
            if !content_type.is_empty() {
                flags.push(format!(
                    "-H {}",
                    shell_quote(&format!("Content-Type: {content_type}"))
                ));
            }
            flags.push(format!("--data-raw {}", shell_quote(text)));
        }
        Body::FormUrlencoded { fields } => {
            // curl --data-urlencode encodes each pair the way the engine does
            // for application/x-www-form-urlencoded.
            for field in fields.iter().filter(|kv| kv.enabled) {
                let value = maybe_redact_named(&field.name, &field.value, redact);
                flags.push(format!(
                    "--data-urlencode {}",
                    shell_quote(&format!("{}={}", field.name, value))
                ));
            }
        }
        Body::Multipart { parts } => {
            for part in parts {
                match part {
                    MultipartPart::Text { name, value } => {
                        let shown = maybe_redact_named(name, value, redact);
                        flags.push(format!("-F {}", shell_quote(&format!("{name}={shown}"))));
                    }
                    MultipartPart::File {
                        name,
                        path,
                        content_type,
                    } => {
                        let spec = match content_type {
                            Some(ct) => format!("{name}=@{path};type={ct}"),
                            None => format!("{name}=@{path}"),
                        };
                        flags.push(format!("-F {}", shell_quote(&spec)));
                    }
                }
            }
        }
    }
}

/// Emit transport option flags matching RequestOptions defaults and overrides.
fn push_option_flags(flags: &mut Vec<String>, options: &RequestOptions) {
    if options.follow_redirects {
        flags.push("-L".to_string());
        flags.push(format!("--max-redirs {}", options.max_redirects));
    }
    if options.insecure {
        flags.push("-k".to_string());
    }
    if let Some(ca) = &options.ca_bundle_path {
        flags.push(format!("--cacert {}", shell_quote(ca)));
    }
    if options.compressed {
        flags.push("--compressed".to_string());
    }
    // curl --max-time is in seconds; the engine's timeout is in milliseconds.
    let seconds = (options.timeout_ms as f64) / 1000.0;
    flags.push(format!("--max-time {}", trim_float(seconds)));
}

/// Render a float without a trailing ".0" so whole seconds read cleanly.
fn trim_float(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        // Trim trailing zeros from a fractional representation.
        let s = format!("{value}");
        s
    }
}

/// Mask a header value when it is a known secret header and redaction is on.
fn maybe_redact_header(name: &str, value: &str, redact: bool) -> String {
    if redact && SECRET_HEADERS.contains(&name.to_ascii_lowercase().as_str()) {
        REDACTED.to_string()
    } else {
        value.to_string()
    }
}

/// Mask a value whose field name hints at a secret (token/password/…).
fn maybe_redact_named(name: &str, value: &str, redact: bool) -> String {
    if redact && name_looks_secret(name) {
        REDACTED.to_string()
    } else {
        value.to_string()
    }
}

fn name_looks_secret(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SECRET_NAME_HINTS.iter().any(|hint| lower.contains(hint))
}

fn percent_encode(value: &str) -> String {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

// ------------------------------- shell quoting -------------------------------

/// POSIX single-quote a shell argument so it can never be misread as a flag or
/// glob. Empty and any value starting with `-` or `@`, or containing shell
/// metacharacters, MUST be quoted; a leading `-`/`@` as a bare argument would be
/// interpreted by curl as an option or a file reference. Single quotes inside
/// are escaped as `'\''` (close, escaped quote, reopen), the only safe way in
/// sh. Fully "safe" tokens are returned unquoted for readability.
fn shell_quote(value: &str) -> String {
    if !value.is_empty() && value.bytes().all(is_shell_safe) && !starts_dangerous(value) {
        return value.to_string();
    }
    let escaped = value.replace('\'', "'\\''");
    format!("'{escaped}'")
}

/// Bytes that never need quoting in a POSIX shell word.
fn is_shell_safe(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/' | b':' | b',' | b'=')
}

/// A leading `-` (looks like a flag) or `@` (curl treats `@file` as a file
/// reference in some contexts) must always be quoted even if otherwise safe.
fn starts_dangerous(value: &str) -> bool {
    value.starts_with('-') || value.starts_with('@')
}

// ============================ curl -> RequestSpec ============================

#[tauri::command]
pub fn from_curl(command: String) -> Result<RequestSpec, String> {
    parse_curl(&command)
}

/// Tolerant curl parser. Tokenizes with shell-words (so quoting and multi-line
/// backslash continuations are handled), skips the leading `curl`, and maps
/// recognized flags onto a RequestSpec. Unknown flags are ignored rather than
/// rejected so a command with options we do not model still parses.
fn parse_curl(command: &str) -> Result<RequestSpec, String> {
    // Fold the command into one logical line for shell-words: drop `# ...`
    // comment lines (we emit those for SigV4) and strip a trailing backslash
    // line-continuation from each remaining line before joining with a space.
    // Doing it per-line is what makes a multi-line DevTools paste tokenize
    // correctly — a leftover `\` would otherwise escape the following space.
    let cleaned = command
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .map(|line| line.trim_end().strip_suffix('\\').unwrap_or(line))
        .collect::<Vec<_>>()
        .join(" ");

    let tokens =
        shell_words::split(&cleaned).map_err(|error| format!("cannot tokenize curl: {error}"))?;
    let mut tokens = tokens.into_iter().peekable();

    // Skip a leading `curl` (or a path ending in it) if present.
    if let Some(first) = tokens.peek() {
        if first == "curl" || first.ends_with("/curl") {
            tokens.next();
        }
    }

    let mut acc = Accumulator::default();

    while let Some(token) = tokens.next() {
        // Split "--flag=value" into flag + value so both forms are accepted.
        let (flag, inline_value) = match token.split_once('=') {
            Some((f, v)) if f.starts_with('-') => (f.to_string(), Some(v.to_string())),
            _ => (token.clone(), None),
        };
        let take_value = |tokens: &mut std::iter::Peekable<std::vec::IntoIter<String>>| {
            inline_value.clone().or_else(|| tokens.next())
        };

        match flag.as_str() {
            "-X" | "--request" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.method = Some(value.to_ascii_uppercase());
                }
            }
            "-H" | "--header" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.push_header(&value);
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.push_raw_data(&value);
                }
            }
            "--data-urlencode" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.push_urlencoded(&value);
                }
            }
            "-F" | "--form" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.push_form(&value);
                }
            }
            "-u" | "--user" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.set_basic(&value);
                }
            }
            "-b" | "--cookie" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.push_cookie(&value);
                }
            }
            "--url" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.set_url(&value);
                }
            }
            "-L" | "--location" => acc.options.follow_redirects = true,
            "-k" | "--insecure" => acc.options.insecure = true,
            "--compressed" => acc.options.compressed = true,
            "--max-time" => {
                if let Some(value) = take_value(&mut tokens) {
                    if let Ok(seconds) = value.trim().parse::<f64>() {
                        acc.options.timeout_ms = (seconds * 1000.0) as u64;
                    }
                }
            }
            "--max-redirs" => {
                if let Some(value) = take_value(&mut tokens) {
                    if let Ok(count) = value.trim().parse::<u32>() {
                        acc.options.max_redirects = count;
                    }
                }
            }
            "--cacert" => {
                if let Some(value) = take_value(&mut tokens) {
                    acc.options.ca_bundle_path = Some(value);
                }
            }
            other if other.starts_with('-') => {
                // Unknown flag. Consume nothing extra — we cannot know its arity
                // and guessing risks swallowing the URL, so we drop just the
                // flag and keep parsing.
                let _ = other;
            }
            _ => {
                // A bare (non-flag) token is the URL.
                acc.set_url(&token);
            }
        }
    }

    acc.into_spec()
}

/// Mutable state gathered while walking curl tokens, finalized into a spec.
#[derive(Default)]
struct Accumulator {
    url: Option<String>,
    method: Option<String>,
    headers: Vec<KeyValue>,
    raw_data: Vec<String>,
    urlencoded: Vec<KeyValue>,
    form: Vec<MultipartPart>,
    basic: Option<(String, String)>,
    // Seeded from RequestOptions::default(); the -L/-k/--compressed/--max-time/
    // --max-redirs flags override individual fields. Keeping the defaults makes
    // to_curl -> from_curl -> to_curl a stable fixed point (the emitted command
    // always carries -L/--compressed/--max-redirs/--max-time, which parse back
    // to the same values).
    options: RequestOptions,
}

impl Accumulator {
    fn set_url(&mut self, value: &str) {
        if self.url.is_none() {
            self.url = Some(value.to_string());
        }
    }

    fn push_header(&mut self, raw: &str) {
        if let Some((name, value)) = raw.split_once(':') {
            self.headers.push(KeyValue {
                name: name.trim().to_string(),
                value: value.trim().to_string(),
                enabled: true,
            });
        }
    }

    fn push_raw_data(&mut self, value: &str) {
        self.raw_data.push(value.to_string());
    }

    fn push_urlencoded(&mut self, raw: &str) {
        // curl accepts "name=value", "=value", "name@file" and bare "content";
        // we model the common "name=value" and bare-content cases.
        if let Some((name, value)) = raw.split_once('=') {
            self.urlencoded.push(KeyValue {
                name: name.to_string(),
                value: value.to_string(),
                enabled: true,
            });
        } else {
            self.urlencoded.push(KeyValue {
                name: String::new(),
                value: raw.to_string(),
                enabled: true,
            });
        }
    }

    fn push_form(&mut self, raw: &str) {
        let Some((name, rest)) = raw.split_once('=') else {
            return;
        };
        if let Some(file_spec) = rest.strip_prefix('@') {
            // "@path" optionally with ";type=..." / ";filename=..." suffixes.
            let (path, content_type) = match file_spec.split_once(';') {
                Some((path, params)) => (path.to_string(), extract_type(params)),
                None => (file_spec.to_string(), None),
            };
            self.form.push(MultipartPart::File {
                name: name.to_string(),
                path,
                content_type,
            });
        } else {
            self.form.push(MultipartPart::Text {
                name: name.to_string(),
                value: rest.to_string(),
            });
        }
    }

    fn set_basic(&mut self, raw: &str) {
        let (user, password) = match raw.split_once(':') {
            Some((u, p)) => (u.to_string(), p.to_string()),
            None => (raw.to_string(), String::new()),
        };
        self.basic = Some((user, password));
    }

    fn push_cookie(&mut self, raw: &str) {
        // A "-b name=value" pair becomes a Cookie header, matching how curl
        // sends it on the wire.
        self.headers.push(KeyValue {
            name: "Cookie".to_string(),
            value: raw.to_string(),
            enabled: true,
        });
    }

    fn into_spec(mut self) -> Result<RequestSpec, String> {
        let url_with_query = self.url.take().ok_or("no URL found in curl command")?;
        let (url, query_params) = split_url_query(&url_with_query);

        let auth = self.resolve_auth();
        let body = self.resolve_body();

        // Method: explicit -X wins; otherwise POST when a body is present,
        // matching curl's own behaviour (-d/-F imply POST), else GET.
        let has_body = !matches!(body, Body::None);
        let method = self.method.clone().unwrap_or_else(|| {
            if has_body {
                "POST".to_string()
            } else {
                "GET".to_string()
            }
        });

        Ok(RequestSpec {
            id: uuid::Uuid::new_v4().to_string(),
            method,
            url,
            headers: self.headers.clone(),
            query_params,
            body,
            auth,
            options: self.options.clone(),
        })
    }

    /// Prefer an explicit Authorization header (Bearer), else -u (Basic).
    fn resolve_auth(&mut self) -> Auth {
        if let Some(index) = self
            .headers
            .iter()
            .position(|h| h.name.eq_ignore_ascii_case("authorization"))
        {
            let header = self.headers[index].value.clone();
            // Case-insensitive "bearer " prefix; the token is everything after.
            if header.len() >= 7 && header[..7].eq_ignore_ascii_case("bearer ") {
                self.headers.remove(index);
                return Auth::Bearer {
                    token: header[7..].trim().to_string(),
                };
            }
        }
        if let Some((username, password)) = &self.basic {
            return Auth::Basic {
                username: username.clone(),
                password: password.clone(),
            };
        }
        Auth::None
    }

    /// Fold accumulated body flags into the single Body the spec allows.
    /// Multipart wins over urlencoded wins over raw, matching curl precedence
    /// (you cannot mix -F with -d in one request).
    fn resolve_body(&mut self) -> Body {
        if !self.form.is_empty() {
            return Body::Multipart {
                parts: std::mem::take(&mut self.form),
            };
        }
        if !self.urlencoded.is_empty() {
            return Body::FormUrlencoded {
                fields: std::mem::take(&mut self.urlencoded),
            };
        }
        if !self.raw_data.is_empty() {
            // curl joins multiple -d values with '&'.
            let text = self.raw_data.join("&");
            // Move the Content-Type header ONTO the body so it is not also
            // emitted as an explicit header on the way back out (which would
            // duplicate it and break the round-trip); to_curl re-derives the
            // Content-Type header from Body::Raw.
            let content_type = self
                .headers
                .iter()
                .position(|h| h.name.eq_ignore_ascii_case("content-type"))
                .map(|index| self.headers.remove(index).value)
                .unwrap_or_default();
            return Body::Raw { content_type, text };
        }
        Body::None
    }
}

/// Pull a `type=<mime>` value out of a `-F` param suffix (`;type=...;...`).
fn extract_type(params: &str) -> Option<String> {
    params.split(';').find_map(|segment| {
        segment
            .trim()
            .strip_prefix("type=")
            .map(|value| value.to_string())
    })
}

/// Split a URL into (base, decoded query params). Percent-decoding mirrors the
/// engine's percent-encoding so a round-trip is stable.
fn split_url_query(url: &str) -> (String, Vec<KeyValue>) {
    let Some((base, query)) = url.split_once('?') else {
        return (url.to_string(), Vec::new());
    };
    let mut params = Vec::new();
    for pair in query.split('&').filter(|segment| !segment.is_empty()) {
        let (name, value) = match pair.split_once('=') {
            Some((name, value)) => (percent_decode(name), percent_decode(value)),
            None => (percent_decode(pair), String::new()),
        };
        params.push(KeyValue {
            name,
            value,
            enabled: true,
        });
    }
    (base.to_string(), params)
}

fn percent_decode(value: &str) -> String {
    percent_encoding::percent_decode_str(value)
        .decode_utf8_lossy()
        .to_string()
}

// ================================== tests ===================================

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(method: &str, url: &str) -> RequestSpec {
        RequestSpec {
            id: "test-id".to_string(),
            method: method.to_string(),
            url: url.to_string(),
            headers: Vec::new(),
            query_params: Vec::new(),
            body: Body::None,
            auth: Auth::None,
            options: RequestOptions::default(),
        }
    }

    // ----------------------------- shell_quote -----------------------------

    #[test]
    fn shell_quote_leaves_safe_tokens_bare() {
        assert_eq!(shell_quote("application/json"), "application/json");
        assert_eq!(
            shell_quote("https://a.test/x?y=1"),
            "'https://a.test/x?y=1'"
        );
        assert_eq!(shell_quote("GET"), "GET");
    }

    #[test]
    fn shell_quote_wraps_leading_dash_and_at() {
        // Leading dash or @ must never be a bare argument.
        assert_eq!(shell_quote("-evil"), "'-evil'");
        assert_eq!(shell_quote("@/etc/passwd"), "'@/etc/passwd'");
    }

    #[test]
    fn shell_quote_escapes_embedded_single_quote() {
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn shell_quote_wraps_empty_and_spaces() {
        assert_eq!(shell_quote(""), "''");
        assert_eq!(shell_quote("a b"), "'a b'");
    }

    // --------------------------- to_curl basics ----------------------------

    #[test]
    fn to_curl_omits_x_for_get() {
        let out = to_curl(spec("GET", "https://a.test/p"), false).unwrap();
        assert!(!out.contains("-X GET"), "GET must not emit -X: {out}");
        // A fully shell-safe URL is emitted bare for readability.
        assert!(out.contains("--url https://a.test/p"), "{out}");
    }

    #[test]
    fn to_curl_emits_x_for_post() {
        let out = to_curl(spec("POST", "https://a.test/p"), false).unwrap();
        assert!(out.contains("-X POST"));
    }

    #[test]
    fn to_curl_folds_query_params_into_url() {
        let mut s = spec("GET", "https://a.test/p");
        s.query_params = vec![
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
        let out = to_curl(s, false).unwrap();
        assert!(out.contains("q=a%20b"), "params encoded into url: {out}");
        assert!(!out.contains("skip"), "disabled param excluded: {out}");
    }

    #[test]
    fn to_curl_sanitizes_dangerous_param_value() {
        // A value starting with '-' must never be a bare argument, and an '@'
        // value in the URL is encoded, not left to look like a file ref.
        let mut s = spec("GET", "https://a.test/p");
        s.query_params = vec![
            KeyValue {
                name: "x".into(),
                value: "-evil".into(),
                enabled: true,
            },
            KeyValue {
                name: "path".into(),
                value: "@/etc/passwd".into(),
                enabled: true,
            },
        ];
        let out = to_curl(s, false).unwrap();
        // Whole --url argument is single-quoted (starts with https, but has
        // special chars), so the -evil cannot detach into its own arg.
        let url_line = out.lines().find(|l| l.contains("--url")).unwrap();
        assert!(
            url_line.contains("'https://a.test/p?"),
            "url quoted: {url_line}"
        );
        // The dangerous value is percent-encoded inside the quoted URL: a
        // leading '-' encodes to %2D so it can never look like a flag.
        assert!(
            url_line.contains("x=%2Devil"),
            "leading dash encoded: {url_line}"
        );
        assert!(out.contains("%40%2Fetc%2Fpasswd"), "@ path encoded: {out}");
        // No bare `-evil` token can appear anywhere in the command.
        assert!(!out.contains(" -evil"), "no bare -evil arg: {out}");
    }

    #[test]
    fn to_curl_headers_and_raw_body() {
        let mut s = spec("POST", "https://a.test/p");
        s.headers = vec![KeyValue {
            name: "X-Trace".into(),
            value: "abc".into(),
            enabled: true,
        }];
        s.body = Body::Raw {
            content_type: "application/json".into(),
            text: r#"{"a":1}"#.into(),
        };
        let out = to_curl(s, false).unwrap();
        assert!(out.contains("-H 'X-Trace: abc'"));
        assert!(out.contains("-H 'Content-Type: application/json'"));
        assert!(out.contains("--data-raw '{\"a\":1}'"));
    }

    #[test]
    fn to_curl_basic_uses_dash_u() {
        let mut s = spec("GET", "https://a.test/p");
        s.auth = Auth::Basic {
            username: "user".into(),
            password: "pw".into(),
        };
        let out = to_curl(s, false).unwrap();
        assert!(
            out.contains("-u 'user:pw'") || out.contains("-u user:pw"),
            "{out}"
        );
    }

    #[test]
    fn to_curl_multipart_text_and_file() {
        let mut s = spec("POST", "https://a.test/upload");
        s.body = Body::Multipart {
            parts: vec![
                MultipartPart::Text {
                    name: "field".into(),
                    value: "v".into(),
                },
                MultipartPart::File {
                    name: "file".into(),
                    path: "/tmp/x.png".into(),
                    content_type: Some("image/png".into()),
                },
            ],
        };
        let out = to_curl(s, false).unwrap();
        assert!(out.contains("-F 'field=v'") || out.contains("-F field=v"));
        assert!(out.contains("-F 'file=@/tmp/x.png;type=image/png'"));
    }

    #[test]
    fn to_curl_options_flags() {
        let mut s = spec("GET", "https://a.test/p");
        s.options = RequestOptions {
            follow_redirects: true,
            max_redirects: 5,
            timeout_ms: 30_000,
            insecure: true,
            ca_bundle_path: Some("/tmp/ca.pem".into()),
            compressed: true,
            cookie_jar: None,
        };
        let out = to_curl(s, false).unwrap();
        assert!(out.contains("-L"));
        assert!(out.contains("--max-redirs 5"));
        assert!(out.contains("-k"));
        assert!(out.contains("--cacert /tmp/ca.pem"));
        assert!(out.contains("--compressed"));
        assert!(out.contains("--max-time 30"));
    }

    #[test]
    fn to_curl_sigv4_leaves_comment_and_headers() {
        let mut s = spec("GET", "https://a.test/p");
        s.auth = Auth::SigV4 {
            profile: "default".into(),
            region: "eu-central-1".into(),
            service: "s3".into(),
        };
        let out = to_curl(s, false).unwrap();
        assert!(out.contains("# signed with AWS SigV4"));
        assert!(out.contains("X-Amz-Date"));
    }

    // ----------------------------- redaction -------------------------------

    #[test]
    fn redact_masks_bearer_token() {
        let mut s = spec("GET", "https://a.test/p");
        s.auth = Auth::Bearer {
            token: "supersecret".into(),
        };
        let out = to_curl(s, true).unwrap();
        assert!(out.contains("•••"), "{out}");
        assert!(!out.contains("supersecret"), "secret leaked: {out}");
    }

    #[test]
    fn redact_masks_authorization_header() {
        let mut s = spec("GET", "https://a.test/p");
        s.headers = vec![KeyValue {
            name: "Authorization".into(),
            value: "token abc123".into(),
            enabled: true,
        }];
        let out = to_curl(s, true).unwrap();
        assert!(!out.contains("abc123"));
        assert!(out.contains("Authorization: •••"));
    }

    #[test]
    fn redact_masks_api_key_query_value() {
        let mut s = spec("GET", "https://a.test/p");
        s.auth = Auth::ApiKey {
            name: "apikey".into(),
            value: "secretvalue".into(),
            placement: ApiKeyPlacement::Query,
        };
        let out = to_curl(s, true).unwrap();
        assert!(!out.contains("secretvalue"), "api key leaked: {out}");
        assert!(out.contains("apikey=•••"), "redacted query key: {out}");
    }

    // ------------------------------ from_curl ------------------------------

    #[test]
    fn from_curl_parses_get_with_params() {
        let s = from_curl("curl --url 'https://a.test/p?q=a%20b&n=1'".into()).unwrap();
        assert_eq!(s.method, "GET");
        assert_eq!(s.url, "https://a.test/p");
        assert_eq!(s.query_params.len(), 2);
        assert_eq!(s.query_params[0].name, "q");
        assert_eq!(s.query_params[0].value, "a b");
    }

    #[test]
    fn from_curl_infers_post_from_data() {
        let s = from_curl("curl https://a.test/p -d '{\"a\":1}'".into()).unwrap();
        assert_eq!(s.method, "POST");
        match s.body {
            Body::Raw { text, .. } => assert_eq!(text, "{\"a\":1}"),
            other => panic!("expected raw body, got {other:?}"),
        }
    }

    #[test]
    fn from_curl_explicit_method_wins() {
        let s = from_curl("curl -X PUT https://a.test/p".into()).unwrap();
        assert_eq!(s.method, "PUT");
    }

    #[test]
    fn from_curl_basic_from_dash_u() {
        let s = from_curl("curl -u user:pw https://a.test/p".into()).unwrap();
        match s.auth {
            Auth::Basic { username, password } => {
                assert_eq!(username, "user");
                assert_eq!(password, "pw");
            }
            other => panic!("expected basic auth, got {other:?}"),
        }
    }

    #[test]
    fn from_curl_bearer_from_header() {
        let s =
            from_curl("curl -H 'Authorization: Bearer tok123' https://a.test/p".into()).unwrap();
        match s.auth {
            Auth::Bearer { token } => assert_eq!(token, "tok123"),
            other => panic!("expected bearer, got {other:?}"),
        }
        // The Authorization header must be consumed, not left duplicated.
        assert!(!s
            .headers
            .iter()
            .any(|h| h.name.eq_ignore_ascii_case("authorization")));
    }

    #[test]
    fn from_curl_multipart() {
        let s = from_curl(
            "curl -F 'field=v' -F 'file=@/tmp/x.png;type=image/png' https://a.test/u".into(),
        )
        .unwrap();
        match s.body {
            Body::Multipart { parts } => {
                assert_eq!(parts.len(), 2);
                assert!(
                    matches!(&parts[0], MultipartPart::Text { name, value } if name == "field" && value == "v")
                );
                assert!(
                    matches!(&parts[1], MultipartPart::File { path, content_type, .. }
                    if path == "/tmp/x.png" && content_type.as_deref() == Some("image/png"))
                );
            }
            other => panic!("expected multipart, got {other:?}"),
        }
    }

    #[test]
    fn from_curl_ignores_unknown_flags() {
        // --http2 and -s are not modeled; they must be skipped, not error.
        let s = from_curl("curl -s --http2 -X POST https://a.test/p".into()).unwrap();
        assert_eq!(s.method, "POST");
        assert_eq!(s.url, "https://a.test/p");
    }

    #[test]
    fn from_curl_parses_multiline_devtools_command() {
        // The shape you get from Chrome DevTools "Copy as cURL".
        let cmd = "curl 'https://a.test/api/items?page=2' \\\n  -H 'accept: application/json' \\\n  -H 'authorization: Bearer devtools-token' \\\n  --data-raw '{\"q\":\"x\"}' \\\n  --compressed";
        let s = from_curl(cmd.into()).unwrap();
        assert_eq!(s.url, "https://a.test/api/items");
        assert_eq!(s.query_params.len(), 1);
        assert_eq!(s.query_params[0].name, "page");
        assert!(s.options.compressed);
        assert!(matches!(s.auth, Auth::Bearer { .. }));
        assert!(matches!(s.body, Body::Raw { .. }));
    }

    #[test]
    fn from_curl_options() {
        let s = from_curl(
            "curl -L -k --compressed --max-time 12 --max-redirs 3 --cacert /tmp/ca.pem https://a.test/p".into(),
        )
        .unwrap();
        assert!(s.options.follow_redirects);
        assert!(s.options.insecure);
        assert!(s.options.compressed);
        assert_eq!(s.options.timeout_ms, 12_000);
        assert_eq!(s.options.max_redirects, 3);
        assert_eq!(s.options.ca_bundle_path.as_deref(), Some("/tmp/ca.pem"));
    }

    // ------------------------------ round-trip -----------------------------

    /// to_curl -> from_curl -> to_curl must be stable (fixed point on the
    /// second emission). This is the brand-critical invariant.
    fn assert_round_trip_stable(s: RequestSpec) {
        let first = to_curl(s, false).unwrap();
        let parsed = from_curl(first.clone()).unwrap();
        let second = to_curl(parsed, false).unwrap();
        assert_eq!(
            first, second,
            "round-trip not stable:\nFIRST:\n{first}\nSECOND:\n{second}"
        );
    }

    #[test]
    fn round_trip_get_with_params() {
        let mut s = spec("GET", "https://a.test/search");
        s.query_params = vec![
            KeyValue {
                name: "q".into(),
                value: "hello world".into(),
                enabled: true,
            },
            KeyValue {
                name: "page".into(),
                value: "2".into(),
                enabled: true,
            },
        ];
        assert_round_trip_stable(s);
    }

    #[test]
    fn round_trip_post_json_with_headers() {
        let mut s = spec("POST", "https://a.test/api");
        s.headers = vec![
            KeyValue {
                name: "X-Trace".into(),
                value: "id-42".into(),
                enabled: true,
            },
            KeyValue {
                name: "Accept".into(),
                value: "application/json".into(),
                enabled: true,
            },
        ];
        s.body = Body::Raw {
            content_type: "application/json".into(),
            text: r#"{"name":"lokówka","n":1}"#.into(),
        };
        assert_round_trip_stable(s);
    }

    #[test]
    fn round_trip_basic_auth() {
        let mut s = spec("GET", "https://a.test/secure");
        s.auth = Auth::Basic {
            username: "admin".into(),
            password: "p@ss".into(),
        };
        assert_round_trip_stable(s);
    }

    #[test]
    fn round_trip_multipart() {
        let mut s = spec("POST", "https://a.test/upload");
        s.body = Body::Multipart {
            parts: vec![
                MultipartPart::Text {
                    name: "caption".into(),
                    value: "a photo".into(),
                },
                MultipartPart::File {
                    name: "photo".into(),
                    path: "/tmp/pic.png".into(),
                    content_type: Some("image/png".into()),
                },
            ],
        };
        assert_round_trip_stable(s);
    }
}
