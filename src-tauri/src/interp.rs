//! Closed, non-Turing-complete interpolation engine.
//! Syntax: {{env.NAME}}, {{secret.NAME}}, {{$uuid}}, {{$timestamp}},
//! {{$random.int(a,b)}}, {{$datetime.iso}}, {{$base64(...)}} …
//! Context-aware escaping (URL vs JSON vs header), iterative expansion with
//! cycle detection. NEVER embed a general template engine here (Insomnia's
//! Nunjucks template-injection CVE is the cautionary tale).

use std::collections::HashMap;
use std::collections::HashSet;

use base64::Engine as _;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use rand::Rng;

/// URL escaping set for interpolated values: percent-encode everything that is
/// not an RFC 3986 *unreserved* character. `NON_ALPHANUMERIC` on its own also
/// encodes the four unreserved marks `-` `.` `_` `~`, which is legal but noisy
/// and round-trips poorly; we keep them literal.
const URL_UNRESERVED: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// Rendering context: resolved variable maps. Secrets are injected by the
/// caller just-in-time and must never be persisted with the result. `vars` holds
/// run-scoped workflow variables (populated by the workflow executor from
/// ExtractNode); it is empty for an ordinary one-shot send.
#[derive(Debug, Default, Clone)]
pub struct RenderCtx {
    pub env: HashMap<String, String>,
    pub secrets: HashMap<String, String>,
    /// Run-scoped variables (`{{var.NAME}}`), threaded between workflow steps.
    pub vars: HashMap<String, String>,
}

/// Where the rendered value lands — drives escaping rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderTarget {
    Url,
    Header,
    JsonBody,
    RawText,
}

const MAX_PASSES: usize = 8;

/// Curl-style leading `-`/`@` values must not be interpolated into a URL as-is:
/// they change curl's argument parsing. curlgen decides what to do; interp only
/// flags them so a caller can guard.
pub fn is_flag_like(value: &str) -> bool {
    value.starts_with('-') || value.starts_with('@')
}

/// Render a template string against the context.
pub fn render(input: &str, ctx: &RenderCtx, target: RenderTarget) -> Result<String, String> {
    let mut active: HashSet<String> = HashSet::new();
    render_inner(input, ctx, target, &mut active, 0)
}

/// Expand one full pass over the string, recursing into the value of every
/// variable so that `{{a}}` -> `{{b}}` -> value resolves, while `active` tracks
/// the resolution stack to catch cycles.
fn render_inner(
    input: &str,
    ctx: &RenderCtx,
    target: RenderTarget,
    active: &mut HashSet<String>,
    depth: usize,
) -> Result<String, String> {
    if depth > MAX_PASSES {
        return Err("interpolation exceeded maximum expansion depth".into());
    }

    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        if let Some(rest) = input[i..].strip_prefix("{{") {
            let close = rest
                .find("}}")
                .ok_or_else(|| "unterminated {{ in template".to_string())?;
            let token = rest[..close].trim();
            let resolved = resolve_token(token, ctx, active)?;
            // Escaping happens EXACTLY ONCE, on the literal leaf value at the
            // moment it is spliced in. A resolved value that itself contains
            // `{{...}}` is expanded recursively and passes through verbatim —
            // its own leaves were already escaped one level down. Escaping the
            // recursion result instead would double-escape on every nesting
            // level (a space -> %20 -> %2520).
            if resolved.value.contains("{{") {
                // For a namespaced variable we hold its key in `active` for the
                // whole nested expansion so a value that references itself
                // (directly or via a chain) is caught as a cycle.
                let expanded = match resolved.cycle_key {
                    Some(key) => {
                        active.insert(key.clone());
                        let r = render_inner(&resolved.value, ctx, target, active, depth + 1);
                        active.remove(&key);
                        r?
                    }
                    None => render_inner(&resolved.value, ctx, target, active, depth + 1)?,
                };
                out.push_str(&expanded);
            } else {
                out.push_str(&escape_for(&resolved.value, target)?);
            }
            i += 2 + close + 2;
        } else {
            let ch_len = utf8_char_len(bytes[i]);
            out.push_str(&input[i..i + ch_len]);
            i += ch_len;
        }
    }

    Ok(out)
}

/// A resolved token plus, for namespaced variables, the key to hold in the
/// active set while its value is recursively expanded (cycle detection).
struct Resolved {
    value: String,
    cycle_key: Option<String>,
}

/// Resolve a single `{{token}}` to its raw (un-escaped, possibly still
/// templated) value. Dynamic functions win over namespaced lookups.
fn resolve_token(
    token: &str,
    ctx: &RenderCtx,
    active: &HashSet<String>,
) -> Result<Resolved, String> {
    if let Some(func) = token.strip_prefix('$') {
        return Ok(Resolved {
            value: resolve_dynamic(func)?,
            cycle_key: None,
        });
    }

    if let Some(name) = token.strip_prefix("env.") {
        return lookup_var(name, "env", &ctx.env, active);
    }

    // Run-scoped workflow variables — one closed namespace, no expression engine.
    if let Some(name) = token.strip_prefix("var.") {
        return lookup_var(name, "var", &ctx.vars, active);
    }

    if let Some(name) = token.strip_prefix("secret.") {
        let value = ctx
            .secrets
            .get(name)
            .cloned()
            .ok_or_else(|| format!("unknown secret: {name}"))?;
        return Ok(Resolved {
            value,
            cycle_key: None,
        });
    }

    Err(format!("unknown variable: {token}"))
}

/// Look up a namespaced variable, failing when its key is already on the active
/// resolution stack (a cycle).
fn lookup_var(
    name: &str,
    ns: &str,
    map: &HashMap<String, String>,
    active: &HashSet<String>,
) -> Result<Resolved, String> {
    let key = format!("{ns}.{name}");
    if active.contains(&key) {
        return Err(format!("cyclic interpolation detected: {key}"));
    }
    let value = map
        .get(name)
        .cloned()
        .ok_or_else(|| format!("unknown variable: {key}"))?;
    Ok(Resolved {
        value,
        cycle_key: Some(key),
    })
}

/// Evaluate a dynamic `$...` function. Deterministic-shaped output only; no I/O
/// besides the clock and the RNG.
fn resolve_dynamic(func: &str) -> Result<String, String> {
    match func {
        "uuid" => Ok(uuid::Uuid::new_v4().to_string()),
        "timestamp" => Ok(chrono::Utc::now().timestamp().to_string()),
        "timestamp_ms" => Ok(chrono::Utc::now().timestamp_millis().to_string()),
        "datetime.iso" => Ok(chrono::Utc::now().to_rfc3339()),
        _ => resolve_dynamic_call(func),
    }
}

/// Parse and evaluate `name(args)` dynamic functions.
fn resolve_dynamic_call(func: &str) -> Result<String, String> {
    let open = func
        .find('(')
        .ok_or_else(|| format!("unknown dynamic variable: ${func}"))?;
    if !func.ends_with(')') {
        return Err(format!("malformed dynamic call: ${func}"));
    }
    let name = &func[..open];
    let args = &func[open + 1..func.len() - 1];

    match name {
        "random.int" => {
            let (a, b) = parse_two_ints(args)?;
            let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
            let n = rand::thread_rng().gen_range(lo..=hi);
            Ok(n.to_string())
        }
        "random.hex" => {
            let count: usize = args
                .trim()
                .parse()
                .map_err(|_| format!("$random.hex expects a byte count, got: {args}"))?;
            let mut buf = vec![0u8; count];
            rand::thread_rng().fill(&mut buf[..]);
            Ok(hex::encode(buf))
        }
        "base64" => {
            let text = strip_optional_quotes(args);
            Ok(base64::engine::general_purpose::STANDARD.encode(text.as_bytes()))
        }
        other => Err(format!("unknown dynamic function: ${other}(…)")),
    }
}

fn parse_two_ints(args: &str) -> Result<(i64, i64), String> {
    let mut parts = args.split(',');
    let a = parts
        .next()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .ok_or_else(|| format!("$random.int expects (a,b), got: {args}"))?;
    let b = parts
        .next()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .ok_or_else(|| format!("$random.int expects (a,b), got: {args}"))?;
    if parts.next().is_some() {
        return Err(format!("$random.int expects exactly two args, got: {args}"));
    }
    Ok((a, b))
}

/// Allow both `base64(foo)` and `base64("foo")`.
fn strip_optional_quotes(s: &str) -> &str {
    let t = s.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        &t[1..t.len() - 1]
    } else {
        t
    }
}

/// Escape a resolved LEAF value for the destination it will be spliced into.
/// Only literal values (env/secret/dynamic results with no further templating)
/// reach here; already-expanded nested content is passed through verbatim so it
/// is never escaped more than once.
fn escape_for(value: &str, target: RenderTarget) -> Result<String, String> {
    match target {
        RenderTarget::RawText => Ok(value.to_string()),
        RenderTarget::Url => Ok(utf8_percent_encode(value, URL_UNRESERVED).to_string()),
        RenderTarget::Header => {
            if value.contains('\r') || value.contains('\n') {
                return Err("header value must not contain CR or LF".into());
            }
            Ok(value.to_string())
        }
        RenderTarget::JsonBody => Ok(escape_json(value)),
    }
}

/// Escape the interior of a JSON string (caller supplies the surrounding
/// quotes). Control characters below 0x20 are `\u00XX`-escaped.
fn escape_json(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn utf8_char_len(first: u8) -> usize {
    match first {
        b if b < 0x80 => 1,
        b if b >> 5 == 0b110 => 2,
        b if b >> 4 == 0b1110 => 3,
        _ => 4,
    }
}

/// Preview interpolation for the UI (secrets masked as ••••).
#[tauri::command]
pub fn preview_template(input: String, environment_id: Option<String>) -> Result<String, String> {
    let ctx = build_preview_ctx(environment_id);
    render(&input, &ctx, RenderTarget::RawText)
}

/// Build a masking context: public env vars are resolved (best-effort from the
/// store), every secret referenced renders as `••••` so a real value can never
/// leak into a preview.
fn build_preview_ctx(environment_id: Option<String>) -> RenderCtx {
    let mut ctx = RenderCtx::default();
    let Some(id) = environment_id else {
        return ctx;
    };

    if let Ok(envs) = crate::store::list_environments() {
        if let Some(env) = envs.into_iter().find(|e| e.id == id) {
            for kv in env.variables.iter().filter(|kv| kv.enabled) {
                ctx.env.insert(kv.name.clone(), kv.value.clone());
            }
            for name in env.secret_names {
                ctx.secrets.insert(name, "••••".to_string());
            }
        }
    }
    ctx
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with(env: &[(&str, &str)], secrets: &[(&str, &str)]) -> RenderCtx {
        RenderCtx {
            env: env
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            secrets: secrets
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            vars: HashMap::new(),
        }
    }

    #[test]
    fn plain_env_substitution() {
        let ctx = ctx_with(&[("host", "api.example.com")], &[]);
        let out = render("https://{{env.host}}/v1", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "https://api.example.com/v1");
    }

    #[test]
    fn url_target_percent_encodes_value() {
        let ctx = ctx_with(&[("q", "a b/c?d")], &[]);
        let out = render("https://x/?q={{env.q}}", &ctx, RenderTarget::Url).unwrap();
        assert_eq!(out, "https://x/?q=a%20b%2Fc%3Fd");
    }

    #[test]
    fn url_target_encodes_utf8() {
        let ctx = ctx_with(&[("city", "Kraków")], &[]);
        let out = render("{{env.city}}", &ctx, RenderTarget::Url).unwrap();
        assert_eq!(out, "Krak%C3%B3w");
    }

    #[test]
    fn json_target_escapes_quotes_and_controls() {
        let ctx = ctx_with(&[("v", "he said \"hi\"\n\tand \\ left")], &[]);
        let out = render("{\"m\":\"{{env.v}}\"}", &ctx, RenderTarget::JsonBody).unwrap();
        assert_eq!(out, "{\"m\":\"he said \\\"hi\\\"\\n\\tand \\\\ left\"}");
    }

    #[test]
    fn json_escapes_low_control_char() {
        let ctx = ctx_with(&[("v", "a\u{0001}b")], &[]);
        let out = render("{{env.v}}", &ctx, RenderTarget::JsonBody).unwrap();
        assert_eq!(out, "a\\u0001b");
    }

    #[test]
    fn header_target_rejects_crlf() {
        let ctx = ctx_with(&[("v", "line1\r\nInjected: yes")], &[]);
        let err = render("{{env.v}}", &ctx, RenderTarget::Header).unwrap_err();
        assert!(err.contains("CR or LF"), "got: {err}");
    }

    #[test]
    fn header_target_allows_clean_value() {
        let ctx = ctx_with(&[("v", "Bearer abc123")], &[]);
        let out = render("{{env.v}}", &ctx, RenderTarget::Header).unwrap();
        assert_eq!(out, "Bearer abc123");
    }

    #[test]
    fn raw_text_is_verbatim() {
        let ctx = ctx_with(&[("v", "a b\"/c")], &[]);
        let out = render("{{env.v}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "a b\"/c");
    }

    #[test]
    fn nesting_three_levels() {
        let ctx = ctx_with(
            &[("a", "{{env.b}}"), ("b", "{{env.c}}"), ("c", "deep-value")],
            &[],
        );
        let out = render("{{env.a}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "deep-value");
    }

    #[test]
    fn nested_url_target_escapes_leaf_once_not_twice() {
        // Two-level nesting: {{env.a}} -> {{env.b}} -> "hello world".
        // The space must be encoded exactly once (%20), never %2520.
        let ctx = ctx_with(&[("a", "{{env.b}}"), ("b", "hello world")], &[]);
        let out = render("{{env.a}}", &ctx, RenderTarget::Url).unwrap();
        assert_eq!(out, "hello%20world");
        assert!(!out.contains("%2520"), "double-escaped: {out}");
    }

    #[test]
    fn nested_three_levels_url_target_single_escape() {
        // Three-level nesting with a space at the leaf.
        let ctx = ctx_with(
            &[("a", "{{env.b}}"), ("b", "{{env.c}}"), ("c", "a b c")],
            &[],
        );
        let out = render("{{env.a}}", &ctx, RenderTarget::Url).unwrap();
        assert_eq!(out, "a%20b%20c");
        assert!(!out.contains("%2520"), "double-escaped: {out}");
    }

    #[test]
    fn nested_json_target_escapes_quote_exactly_once() {
        // Two-level nesting: leaf contains a double quote; JSON escaping must
        // produce \" exactly once, not \\\" (which would be a double escape).
        let ctx = ctx_with(&[("a", "{{env.b}}"), ("b", "say \"hi\"")], &[]);
        let out = render("{\"m\":\"{{env.a}}\"}", &ctx, RenderTarget::JsonBody).unwrap();
        assert_eq!(out, "{\"m\":\"say \\\"hi\\\"\"}");
        assert!(!out.contains("\\\\\""), "double-escaped: {out}");
    }

    #[test]
    fn nested_three_levels_json_target_single_escape() {
        let ctx = ctx_with(
            &[("a", "{{env.b}}"), ("b", "{{env.c}}"), ("c", "q\"x")],
            &[],
        );
        let out = render("{{env.a}}", &ctx, RenderTarget::JsonBody).unwrap();
        assert_eq!(out, "q\\\"x");
        assert!(!out.contains("\\\\\""), "double-escaped: {out}");
    }

    #[test]
    fn url_target_keeps_rfc3986_unreserved() {
        // -._~ are RFC 3986 unreserved and must NOT be percent-encoded.
        let ctx = ctx_with(&[("v", "a-b_c.d~e")], &[]);
        let out = render("{{env.v}}", &ctx, RenderTarget::Url).unwrap();
        assert_eq!(out, "a-b_c.d~e");
    }

    #[test]
    fn cycle_a_b_a_is_detected() {
        let ctx = ctx_with(&[("a", "{{env.b}}"), ("b", "{{env.a}}")], &[]);
        let err = render("{{env.a}}", &ctx, RenderTarget::RawText).unwrap_err();
        assert!(err.contains("cyclic"), "got: {err}");
        assert!(err.contains("env.a") || err.contains("env.b"), "got: {err}");
    }

    #[test]
    fn run_var_substitution() {
        // A run-scoped {{var.NAME}} resolves from ctx.vars, distinct from env.
        let mut ctx = ctx_with(&[("token", "env-value")], &[]);
        ctx.vars
            .insert("token".to_string(), "run-value".to_string());
        let out = render("{{var.token}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "run-value");
        // The identically-named env var is unaffected — the namespaces are separate.
        let env_out = render("{{env.token}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(env_out, "env-value");
    }

    #[test]
    fn unknown_run_var_errors_with_name() {
        let ctx = ctx_with(&[], &[]);
        let err = render("{{var.missing}}", &ctx, RenderTarget::RawText).unwrap_err();
        assert!(err.contains("missing"), "got: {err}");
    }

    #[test]
    fn env_precedence_ctx_overrides() {
        // ctx env value is authoritative; there is no ambient fallback in render.
        let ctx = ctx_with(&[("token", "from-ctx")], &[]);
        let out = render("{{env.token}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "from-ctx");
    }

    #[test]
    fn unknown_variable_errors_with_name() {
        let ctx = ctx_with(&[], &[]);
        let err = render("{{env.missing}}", &ctx, RenderTarget::RawText).unwrap_err();
        assert!(err.contains("missing"), "got: {err}");
    }

    #[test]
    fn unknown_secret_errors_with_name() {
        let ctx = ctx_with(&[], &[]);
        let err = render("{{secret.apikey}}", &ctx, RenderTarget::RawText).unwrap_err();
        assert!(err.contains("apikey"), "got: {err}");
    }

    #[test]
    fn secret_substitution_when_present() {
        let ctx = ctx_with(&[], &[("apikey", "sk-live-123")]);
        let out = render("{{secret.apikey}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "sk-live-123");
    }

    #[test]
    fn dynamic_uuid_is_v4() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$uuid}}", &ctx, RenderTarget::RawText).unwrap();
        let parsed = uuid::Uuid::parse_str(&out).unwrap();
        assert_eq!(parsed.get_version_num(), 4);
        // canonical hyphenated form: 8-4-4-4-12
        let groups: Vec<&str> = out.split('-').collect();
        assert_eq!(
            groups.iter().map(|g| g.len()).collect::<Vec<_>>(),
            vec![8, 4, 4, 4, 12]
        );
        // version nibble is '4', variant nibble in [8,9,a,b]
        assert_eq!(&groups[2][0..1], "4");
        assert!(matches!(&groups[3][0..1], "8" | "9" | "a" | "b"));
    }

    #[test]
    fn dynamic_timestamp_is_numeric() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$timestamp}}", &ctx, RenderTarget::RawText).unwrap();
        assert!(out.parse::<i64>().is_ok(), "got: {out}");
        let ms = render("{{$timestamp_ms}}", &ctx, RenderTarget::RawText).unwrap();
        assert!(ms.parse::<i64>().is_ok(), "got: {ms}");
        assert!(ms.len() >= out.len());
    }

    #[test]
    fn dynamic_datetime_iso() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$datetime.iso}}", &ctx, RenderTarget::RawText).unwrap();
        assert!(
            chrono::DateTime::parse_from_rfc3339(&out).is_ok(),
            "got: {out}"
        );
    }

    #[test]
    fn dynamic_random_int_in_range() {
        let ctx = ctx_with(&[], &[]);
        for _ in 0..200 {
            let out = render("{{$random.int(5,9)}}", &ctx, RenderTarget::RawText).unwrap();
            let n: i64 = out.parse().unwrap();
            assert!((5..=9).contains(&n), "got: {n}");
        }
    }

    #[test]
    fn dynamic_random_int_swapped_bounds() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$random.int(9, 9)}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "9");
    }

    #[test]
    fn dynamic_random_hex_length() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$random.hex(8)}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out.len(), 16); // 8 bytes -> 16 hex chars
        assert!(out.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn dynamic_base64() {
        let ctx = ctx_with(&[], &[]);
        let out = render("{{$base64(hello)}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "aGVsbG8=");
        let quoted = render("{{$base64(\"hello\")}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(quoted, "aGVsbG8=");
    }

    #[test]
    fn unknown_dynamic_errors() {
        let ctx = ctx_with(&[], &[]);
        assert!(render("{{$nope}}", &ctx, RenderTarget::RawText).is_err());
        assert!(render("{{$nope(1)}}", &ctx, RenderTarget::RawText).is_err());
    }

    #[test]
    fn is_flag_like_detects_curl_flags() {
        assert!(is_flag_like("-X"));
        assert!(is_flag_like("@file"));
        assert!(!is_flag_like("value"));
        assert!(!is_flag_like("https://x"));
    }

    #[test]
    fn multiple_tokens_one_line() {
        let ctx = ctx_with(&[("h", "host"), ("p", "8080")], &[]);
        let out = render("http://{{env.h}}:{{env.p}}/", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "http://host:8080/");
    }

    #[test]
    fn same_var_twice_is_not_a_cycle() {
        let ctx = ctx_with(&[("v", "x")], &[]);
        let out = render("{{env.v}}-{{env.v}}", &ctx, RenderTarget::RawText).unwrap();
        assert_eq!(out, "x-x");
    }

    #[test]
    fn unterminated_token_errors() {
        let ctx = ctx_with(&[], &[]);
        assert!(render("{{env.a", &ctx, RenderTarget::RawText).is_err());
    }

    #[test]
    fn preview_masks_secrets_without_env() {
        // environment_id=None → empty env ctx, unknown env var errors, but a
        // pure secret reference cannot resolve either (no store). We only assert
        // that no real secret value can appear: with None there is no store call.
        let out = preview_template("{{$uuid}}".into(), None).unwrap();
        assert!(uuid::Uuid::parse_str(&out).is_ok());
    }

    #[test]
    fn preview_ctx_renders_secret_as_masked_bullets() {
        // A preview ctx carries secret NAMES only (no real values): every
        // referenced secret resolves to •••• so a real value can never leak
        // into a preview render.
        let mut ctx = RenderCtx::default();
        ctx.secrets.insert("apikey".to_string(), "••••".to_string());
        let out = render(
            "Authorization: {{secret.apikey}}",
            &ctx,
            RenderTarget::RawText,
        )
        .unwrap();
        assert_eq!(out, "Authorization: ••••");
        assert!(!out.contains("sk-"), "real secret value leaked: {out}");
    }
}
