//! The resolve+send pipeline: the glue that turns a stored (templated) request
//! into a fully-resolved [`RequestSpec`] and hands it to the engine.
//!
//! Flow: flatten the environment inheritance chain into a flat variable map →
//! pull the referenced secrets from the Keychain → interpolate every field with
//! the correct escaping target (URL / header / JSON / raw text) → sign with
//! SigV4 when the auth demands it → execute through the engine (which persists
//! history itself, so this module never touches the history table).
//!
//! `resolve_preview_curl` builds a REDACTED spec (secrets replaced by a
//! placeholder, never fetched from the Keychain) and defers to curlgen so a
//! shareable command line can be produced without ever exposing a real secret.

use std::collections::HashMap;

use crate::interp::{self, RenderCtx, RenderTarget};
use crate::models::{Auth, Body, Environment, KeyValue, RequestSpec, ResponseData, StoredRequest};
use crate::{curlgen, engine, secrets, sigv4, store};

/// Placeholder substituted for a secret value when building a redacted spec for
/// preview/curl generation — a real secret value must never reach that path.
const SECRET_PLACEHOLDER: &str = "•••";

/// Resolve a stored request against an environment and execute it. History is
/// written by the engine, so this command never persists anything itself.
#[tauri::command]
pub async fn resolve_and_send(
    request: StoredRequest,
    environment_id: Option<String>,
) -> Result<ResponseData, String> {
    let environments = store::list_environments()?;
    let flat = flatten_env(&environments, environment_id.as_deref());
    let ctx = build_render_ctx(&environments, environment_id.as_deref(), &flat, false)?;
    let spec = resolve_spec(&request, &ctx, false)?;
    engine::execute_request(spec).await
}

/// Build a redacted curl command for the request without touching the Keychain:
/// every `{{secret.NAME}}` renders to a placeholder so nothing sensitive leaks
/// into a shareable command line.
#[tauri::command]
pub fn resolve_preview_curl(
    request: StoredRequest,
    environment_id: Option<String>,
) -> Result<String, String> {
    let environments = store::list_environments()?;
    let flat = flatten_env(&environments, environment_id.as_deref());
    let ctx = build_render_ctx(&environments, environment_id.as_deref(), &flat, true)?;
    let spec = resolve_spec(&request, &ctx, true)?;
    match curlgen::to_curl(spec, true) {
        Ok(command) => Ok(command),
        Err(e) if e.contains("not implemented") => {
            Err("curl generation is not available yet (curlgen::to_curl)".to_string())
        }
        Err(e) => Err(e),
    }
}

/// Flatten an environment's inheritance chain into a single variable map.
///
/// Precedence, lowest → highest: the base (root ancestor) sits at the bottom and
/// each descendant (sub-environment) overrides its parent, so the target
/// environment's own variables win. Only enabled variables participate. A
/// missing id (or `None`) yields an empty map. Inheritance cycles are broken by
/// a visited set so a malformed chain cannot loop forever.
pub fn flatten_env(envs: &[Environment], id: Option<&str>) -> HashMap<String, String> {
    let mut flat = HashMap::new();
    let Some(id) = id else {
        return flat;
    };

    // Walk parent → target: collect the chain from the target up to its root,
    // then apply it root-first so descendants overwrite ancestor values.
    let mut chain: Vec<&Environment> = Vec::new();
    let mut visited: Vec<&str> = Vec::new();
    let mut current = envs.iter().find(|e| e.id == id);
    while let Some(env) = current {
        if visited.contains(&env.id.as_str()) {
            break;
        }
        visited.push(&env.id);
        chain.push(env);
        current = env
            .parent_id
            .as_deref()
            .and_then(|pid| envs.iter().find(|e| e.id == pid));
    }

    for env in chain.iter().rev() {
        for kv in env.variables.iter().filter(|kv| kv.enabled) {
            flat.insert(kv.name.clone(), kv.value.clone());
        }
    }
    flat
}

/// Build the interpolation context: the flattened public variables plus every
/// referenced secret. When `redact` is set, secrets resolve to a placeholder and
/// the Keychain is never read (used for preview/curl). Otherwise each secret
/// name declared on the target environment (and its ancestors) is fetched from
/// the Keychain just-in-time.
pub fn build_render_ctx(
    envs: &[Environment],
    id: Option<&str>,
    flat: &HashMap<String, String>,
    redact: bool,
) -> Result<RenderCtx, String> {
    let mut ctx = RenderCtx {
        env: flat.clone(),
        secrets: HashMap::new(),
    };

    for name in secret_names_in_chain(envs, id) {
        let value = if redact {
            SECRET_PLACEHOLDER.to_string()
        } else {
            secrets::secret_get(&name)?
        };
        ctx.secrets.insert(name, value);
    }
    Ok(ctx)
}

/// Collect the secret names declared across the target environment's whole
/// inheritance chain, so an inherited secret reference still resolves.
fn secret_names_in_chain(envs: &[Environment], id: Option<&str>) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let Some(id) = id else {
        return names;
    };
    let mut visited: Vec<&str> = Vec::new();
    let mut current = envs.iter().find(|e| e.id == id);
    while let Some(env) = current {
        if visited.contains(&env.id.as_str()) {
            break;
        }
        visited.push(&env.id);
        for name in &env.secret_names {
            if !names.contains(name) {
                names.push(name.clone());
            }
        }
        current = env
            .parent_id
            .as_deref()
            .and_then(|pid| envs.iter().find(|e| e.id == pid));
    }
    names
}

/// Interpolate a stored request into a fully-resolved [`RequestSpec`] the engine
/// can execute. Each field is rendered with the escaping target that matches
/// where the value lands: header values as headers, a JSON body as JSON, the URL
/// (including its query string) as URL, auth material as raw text.
///
/// `redact` only affects SigV4: with it set the request is not really signed
/// (no credentials are read) and a placeholder Authorization is attached, so a
/// preview spec follows the same interpolation path as a live send. Secret
/// masking for `{{secret.*}}` already happened in [`build_render_ctx`].
pub fn resolve_spec(
    request: &StoredRequest,
    ctx: &RenderCtx,
    redact: bool,
) -> Result<RequestSpec, String> {
    let id = if request.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        request.id.clone()
    };

    let method = interp::render(&request.method, ctx, RenderTarget::RawText)?;
    let url = resolve_url(&request.url, &request.query_params, ctx)?;
    let headers = resolve_headers(&request.headers, ctx)?;
    let body = resolve_body(&request.body, ctx)?;
    let auth = resolve_auth(&request.auth, ctx)?;

    let mut spec = RequestSpec {
        id,
        method,
        url,
        // Query params are folded into `url` above (percent-encoded once), so
        // the engine must not re-encode them — leave the structured list empty.
        headers,
        query_params: Vec::new(),
        body,
        auth,
        options: request.options.clone(),
    };

    // For SigV4 the signature is computed later by the engine over the resolved
    // spec; when previewing we redact and skip real signing, so keep the auth as
    // resolved. `redact` currently changes nothing else about the spec shape.
    let _ = redact;
    if let Auth::SigV4 { .. } = &spec.auth {
        attach_sigv4(&mut spec, redact)?;
    }
    Ok(spec)
}

/// Render the URL and append the interpolated query parameters, percent-encoding
/// each interpolated value exactly once (URL target). Literal URL punctuation
/// (`:` `/` `?` `&`) is preserved by the interpolator, which only rewrites the
/// `{{...}}` tokens.
fn resolve_url(
    url_template: &str,
    query_params: &[KeyValue],
    ctx: &RenderCtx,
) -> Result<String, String> {
    // The URL structure (scheme/host/path/existing query) is authored well-formed
    // and rendered with RawText, so an interpolated host like `127.0.0.1:8080`
    // drops in verbatim — percent-encoding it would corrupt the `:` and break the
    // hostname. Only the structured query params we append are percent-encoded.
    let mut url = interp::render(url_template, ctx, RenderTarget::RawText)?;

    let mut sep = if url.contains('?') { '&' } else { '?' };
    for kv in query_params.iter().filter(|kv| kv.enabled) {
        // Param NAMEs and VALUEs are rendered raw then percent-encoded once as
        // structural URL components (matching the engine's own query encoding).
        let name = interp::render(&kv.name, ctx, RenderTarget::RawText)?;
        let value = interp::render(&kv.value, ctx, RenderTarget::RawText)?;
        url.push(sep);
        url.push_str(&encode_component(&name));
        url.push('=');
        url.push_str(&encode_component(&value));
        sep = '&';
    }
    Ok(url)
}

/// Percent-encode a literal URL component (a param name we assembled ourselves),
/// matching the engine's `NON_ALPHANUMERIC` component encoding.
fn encode_component(value: &str) -> String {
    use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

/// Render header name/value pairs. Values use the Header target so CR/LF
/// injection is rejected; disabled headers are dropped.
fn resolve_headers(headers: &[KeyValue], ctx: &RenderCtx) -> Result<Vec<KeyValue>, String> {
    headers
        .iter()
        .filter(|kv| kv.enabled)
        .map(|kv| {
            let name = interp::render(&kv.name, ctx, RenderTarget::RawText)?;
            let value = interp::render(&kv.value, ctx, RenderTarget::Header)?;
            Ok(KeyValue {
                name,
                value,
                enabled: true,
            })
        })
        .collect()
}

/// Render a body. A raw body with a JSON content type is interpolated with the
/// JSON target so interpolated values are JSON-string-escaped; any other raw
/// body is rendered verbatim (raw text). Form/multipart field values are
/// rendered as raw text (the engine URL-encodes form fields itself).
fn resolve_body(body: &Body, ctx: &RenderCtx) -> Result<Body, String> {
    match body {
        Body::None => Ok(Body::None),
        Body::Raw { content_type, text } => {
            let rendered_ct = interp::render(content_type, ctx, RenderTarget::RawText)?;
            let target = if is_json_content_type(&rendered_ct) {
                RenderTarget::JsonBody
            } else {
                RenderTarget::RawText
            };
            let rendered_text = interp::render(text, ctx, target)?;
            Ok(Body::Raw {
                content_type: rendered_ct,
                text: rendered_text,
            })
        }
        Body::FormUrlencoded { fields } => Ok(Body::FormUrlencoded {
            fields: render_kvs_raw(fields, ctx)?,
        }),
        Body::Multipart { parts } => {
            use crate::models::MultipartPart;
            let mut rendered = Vec::with_capacity(parts.len());
            for part in parts {
                rendered.push(match part {
                    MultipartPart::Text { name, value } => MultipartPart::Text {
                        name: interp::render(name, ctx, RenderTarget::RawText)?,
                        value: interp::render(value, ctx, RenderTarget::RawText)?,
                    },
                    MultipartPart::File {
                        name,
                        path,
                        content_type,
                    } => MultipartPart::File {
                        name: interp::render(name, ctx, RenderTarget::RawText)?,
                        path: interp::render(path, ctx, RenderTarget::RawText)?,
                        content_type: content_type.clone(),
                    },
                });
            }
            Ok(Body::Multipart { parts: rendered })
        }
    }
}

fn is_json_content_type(content_type: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    ct.contains("application/json") || ct.contains("+json")
}

/// Render enabled-only key/values as raw text, preserving the enabled flag.
fn render_kvs_raw(kvs: &[KeyValue], ctx: &RenderCtx) -> Result<Vec<KeyValue>, String> {
    kvs.iter()
        .filter(|kv| kv.enabled)
        .map(|kv| {
            Ok(KeyValue {
                name: interp::render(&kv.name, ctx, RenderTarget::RawText)?,
                value: interp::render(&kv.value, ctx, RenderTarget::RawText)?,
                enabled: true,
            })
        })
        .collect()
}

/// Render the auth block. Credential material (tokens, usernames, passwords, API
/// keys, SigV4 profile/region/service) is raw text — it is placed into headers
/// or the query by the engine, which handles its own encoding. SigV4 signing is
/// applied afterwards over the fully-resolved spec.
fn resolve_auth(auth: &Auth, ctx: &RenderCtx) -> Result<Auth, String> {
    let render_raw = |s: &str| interp::render(s, ctx, RenderTarget::RawText);
    match auth {
        Auth::None => Ok(Auth::None),
        Auth::Bearer { token } => Ok(Auth::Bearer {
            token: render_raw(token)?,
        }),
        Auth::Basic { username, password } => Ok(Auth::Basic {
            username: render_raw(username)?,
            password: render_raw(password)?,
        }),
        Auth::ApiKey {
            name,
            value,
            placement,
        } => Ok(Auth::ApiKey {
            name: render_raw(name)?,
            value: render_raw(value)?,
            placement: placement.clone(),
        }),
        Auth::SigV4 {
            profile,
            region,
            service,
        } => Ok(Auth::SigV4 {
            profile: render_raw(profile)?,
            region: render_raw(region)?,
            service: render_raw(service)?,
        }),
    }
}

/// Sign a resolved SigV4 request and fold the signature headers into the spec,
/// then downgrade the auth to `None` so the engine does not attempt to sign
/// again (the engine also signs SigV4, and it would resolve credentials twice).
/// When `redact` is set (preview), signing is skipped and placeholder headers
/// are attached so a shareable curl shows the shape without a real signature.
fn attach_sigv4(spec: &mut RequestSpec, redact: bool) -> Result<(), String> {
    let (profile, region, service) = match &spec.auth {
        Auth::SigV4 {
            profile,
            region,
            service,
        } => (profile.clone(), region.clone(), service.clone()),
        _ => return Ok(()),
    };

    if redact {
        // Never read credentials for a preview — show a redacted Authorization.
        push_header(spec, "Authorization", SECRET_PLACEHOLDER);
        spec.auth = Auth::None;
        return Ok(());
    }

    let creds = sigv4::load_profile(&profile)?;
    // Prefer the region carried by the request; fall back to ~/.aws/config.
    let effective_region = if region.is_empty() {
        sigv4::region_for_profile(&profile)?
            .ok_or_else(|| format!("no region for SigV4 profile: {profile}"))?
    } else {
        region
    };
    sign_and_attach(spec, &creds, &effective_region, &service)
}

/// Sign the resolved spec with the given credentials, attach the resulting SigV4
/// headers, and clear the auth (already applied). Split out from `attach_sigv4`
/// so the signing/attach step can be exercised with injected credentials, i.e.
/// without reading a profile from `~/.aws` (and mutating a global `$HOME`).
fn sign_and_attach(
    spec: &mut RequestSpec,
    creds: &sigv4::AwsCredentials,
    region: &str,
    service: &str,
) -> Result<(), String> {
    let signed = sigv4::sign(spec, creds, region, service)?;
    for (name, value) in signed {
        push_header(spec, &name, &value);
    }
    spec.auth = Auth::None;
    Ok(())
}

/// Append (or replace) a header on the spec, case-insensitive on the name.
fn push_header(spec: &mut RequestSpec, name: &str, value: &str) {
    spec.headers
        .retain(|kv| !kv.name.eq_ignore_ascii_case(name));
    spec.headers.push(KeyValue {
        name: name.to_string(),
        value: value.to_string(),
        enabled: true,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Auth, Body, RequestOptions};
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn env(id: &str, parent: Option<&str>, vars: &[(&str, &str)], secrets: &[&str]) -> Environment {
        Environment {
            id: id.to_string(),
            name: id.to_string(),
            parent_id: parent.map(|p| p.to_string()),
            color: None,
            variables: vars
                .iter()
                .map(|(k, v)| KeyValue {
                    name: k.to_string(),
                    value: v.to_string(),
                    enabled: true,
                })
                .collect(),
            secret_names: secrets.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn stored(url: &str) -> StoredRequest {
        StoredRequest {
            id: "req-1".into(),
            collection_id: "c".into(),
            name: "r".into(),
            method: "GET".into(),
            url: url.into(),
            headers: vec![],
            query_params: vec![],
            body: Body::None,
            auth: Auth::None,
            options: RequestOptions::default(),
            sort_order: 0,
            docs_md: None,
            graphql: None,
        }
    }

    fn ctx_from(env: &[(&str, &str)], secrets: &[(&str, &str)]) -> RenderCtx {
        RenderCtx {
            env: env
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            secrets: secrets
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    // ---------- flatten_env ----------

    #[test]
    fn flatten_none_id_is_empty() {
        let envs = vec![env("a", None, &[("x", "1")], &[])];
        assert!(flatten_env(&envs, None).is_empty());
    }

    #[test]
    fn flatten_unknown_id_is_empty() {
        let envs = vec![env("a", None, &[("x", "1")], &[])];
        assert!(flatten_env(&envs, Some("missing")).is_empty());
    }

    #[test]
    fn flatten_single_env() {
        let envs = vec![env("a", None, &[("host", "api.example.com")], &[])];
        let flat = flatten_env(&envs, Some("a"));
        assert_eq!(flat.get("host").unwrap(), "api.example.com");
    }

    #[test]
    fn flatten_child_overrides_parent_and_inherits_base() {
        // base defines host+region; sub overrides host and adds stage. Precedence:
        // base at the bottom, sub (the target) wins.
        let base = env(
            "base",
            None,
            &[("host", "base.example.com"), ("region", "us")],
            &[],
        );
        let sub = env(
            "sub",
            Some("base"),
            &[("host", "sub.example.com"), ("stage", "dev")],
            &[],
        );
        let envs = vec![base, sub];
        let flat = flatten_env(&envs, Some("sub"));
        assert_eq!(flat.get("host").unwrap(), "sub.example.com"); // sub wins
        assert_eq!(flat.get("region").unwrap(), "us"); // inherited from base
        assert_eq!(flat.get("stage").unwrap(), "dev"); // sub-only
        assert_eq!(flat.len(), 3);
    }

    #[test]
    fn flatten_three_level_chain_precedence() {
        // root -> mid -> leaf; leaf overrides mid overrides root for the same key.
        let root = env("root", None, &[("k", "root"), ("only_root", "r")], &[]);
        let mid = env("mid", Some("root"), &[("k", "mid"), ("only_mid", "m")], &[]);
        let leaf = env("leaf", Some("mid"), &[("k", "leaf")], &[]);
        let envs = vec![root, mid, leaf];
        let flat = flatten_env(&envs, Some("leaf"));
        assert_eq!(flat.get("k").unwrap(), "leaf");
        assert_eq!(flat.get("only_root").unwrap(), "r");
        assert_eq!(flat.get("only_mid").unwrap(), "m");
    }

    #[test]
    fn flatten_skips_disabled_variables() {
        let mut e = env("a", None, &[("keep", "1")], &[]);
        e.variables.push(KeyValue {
            name: "drop".into(),
            value: "2".into(),
            enabled: false,
        });
        let flat = flatten_env(&[e], Some("a"));
        assert!(flat.contains_key("keep"));
        assert!(!flat.contains_key("drop"));
    }

    #[test]
    fn flatten_breaks_inheritance_cycle() {
        // Malformed data: a and b point at each other. Must not loop forever.
        let a = env("a", Some("b"), &[("x", "a")], &[]);
        let b = env("b", Some("a"), &[("y", "b")], &[]);
        let flat = flatten_env(&[a, b], Some("a"));
        assert_eq!(flat.get("x").unwrap(), "a");
        assert_eq!(flat.get("y").unwrap(), "b");
    }

    // ---------- build_render_ctx ----------

    #[test]
    fn build_ctx_redacts_secrets_without_keychain() {
        let envs = vec![env("a", None, &[("host", "h")], &["api_key"])];
        let flat = flatten_env(&envs, Some("a"));
        let ctx = build_render_ctx(&envs, Some("a"), &flat, true).unwrap();
        assert_eq!(ctx.env.get("host").unwrap(), "h");
        assert_eq!(ctx.secrets.get("api_key").unwrap(), SECRET_PLACEHOLDER);
    }

    #[test]
    fn build_ctx_collects_inherited_secret_names() {
        let base = env("base", None, &[], &["base_secret"]);
        let sub = env("sub", Some("base"), &[], &["sub_secret"]);
        let envs = vec![base, sub];
        let flat = flatten_env(&envs, Some("sub"));
        let ctx = build_render_ctx(&envs, Some("sub"), &flat, true).unwrap();
        assert!(ctx.secrets.contains_key("base_secret"));
        assert!(ctx.secrets.contains_key("sub_secret"));
    }

    // ---------- resolve_spec: interpolation ----------

    #[test]
    fn resolve_spec_generates_id_when_empty() {
        let mut req = stored("https://x/");
        req.id = String::new();
        let ctx = ctx_from(&[], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        assert!(uuid::Uuid::parse_str(&spec.id).is_ok());
    }

    #[test]
    fn resolve_spec_keeps_request_id() {
        let req = stored("https://x/");
        let ctx = ctx_from(&[], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        assert_eq!(spec.id, "req-1");
    }

    #[test]
    fn resolve_spec_interpolates_url() {
        let req = stored("https://{{env.host}}/v1/users");
        let ctx = ctx_from(&[("host", "api.example.com")], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        assert_eq!(spec.url, "https://api.example.com/v1/users");
    }

    #[test]
    fn resolve_spec_interpolates_and_encodes_query_params() {
        let mut req = stored("https://api/search");
        req.query_params = vec![KeyValue {
            name: "q".into(),
            value: "{{env.term}}".into(),
            enabled: true,
        }];
        let ctx = ctx_from(&[("term", "a b/c")], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        // Query folded into the URL, value percent-encoded exactly once.
        assert_eq!(spec.url, "https://api/search?q=a%20b%2Fc");
        assert!(spec.query_params.is_empty());
    }

    #[test]
    fn resolve_spec_interpolates_header() {
        let mut req = stored("https://x/");
        req.headers = vec![KeyValue {
            name: "X-Trace".into(),
            value: "{{env.trace}}".into(),
            enabled: true,
        }];
        let ctx = ctx_from(&[("trace", "abc-123")], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        assert_eq!(spec.headers[0].name, "X-Trace");
        assert_eq!(spec.headers[0].value, "abc-123");
    }

    #[test]
    fn resolve_spec_json_body_escapes_interpolated_value() {
        let mut req = stored("https://x/");
        req.method = "POST".into();
        req.body = Body::Raw {
            content_type: "application/json".into(),
            text: "{\"name\":\"{{env.name}}\"}".into(),
        };
        let ctx = ctx_from(&[("name", "he \"said\" hi")], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        match spec.body {
            Body::Raw { text, .. } => {
                assert_eq!(text, "{\"name\":\"he \\\"said\\\" hi\"}");
            }
            _ => panic!("expected raw body"),
        }
    }

    #[test]
    fn resolve_spec_raw_text_body_is_verbatim() {
        let mut req = stored("https://x/");
        req.body = Body::Raw {
            content_type: "text/plain".into(),
            text: "value={{env.v}}".into(),
        };
        let ctx = ctx_from(&[("v", "a \"b\" c")], &[]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        match spec.body {
            Body::Raw { text, .. } => assert_eq!(text, "value=a \"b\" c"),
            _ => panic!("expected raw body"),
        }
    }

    #[test]
    fn resolve_spec_interpolates_bearer_auth() {
        let mut req = stored("https://x/");
        req.auth = Auth::Bearer {
            token: "{{secret.token}}".into(),
        };
        let ctx = ctx_from(&[], &[("token", "sk-live-999")]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        match spec.auth {
            Auth::Bearer { token } => assert_eq!(token, "sk-live-999"),
            _ => panic!("expected bearer"),
        }
    }

    #[test]
    fn resolve_spec_interpolates_basic_auth() {
        let mut req = stored("https://x/");
        req.auth = Auth::Basic {
            username: "{{env.user}}".into(),
            password: "{{secret.pw}}".into(),
        };
        let ctx = ctx_from(&[("user", "admin")], &[("pw", "hunter2")]);
        let spec = resolve_spec(&req, &ctx, false).unwrap();
        match spec.auth {
            Auth::Basic { username, password } => {
                assert_eq!(username, "admin");
                assert_eq!(password, "hunter2");
            }
            _ => panic!("expected basic"),
        }
    }

    #[test]
    fn resolve_spec_unknown_variable_errors() {
        let req = stored("https://{{env.nope}}/");
        let ctx = ctx_from(&[], &[]);
        let err = resolve_spec(&req, &ctx, false).unwrap_err();
        assert!(err.contains("nope"), "got: {err}");
    }

    #[test]
    fn resolve_spec_unknown_secret_errors() {
        let mut req = stored("https://x/");
        req.auth = Auth::Bearer {
            token: "{{secret.missing}}".into(),
        };
        let ctx = ctx_from(&[], &[]);
        let err = resolve_spec(&req, &ctx, false).unwrap_err();
        assert!(err.contains("missing"), "got: {err}");
    }

    // ---------- SigV4 ----------

    /// Build inline SigV4 credentials so the signing path can be tested without
    /// reading `~/.aws` (which would require mutating the global `$HOME` and race
    /// other tests that read `dirs::home_dir()`).
    fn sigv4_test_creds() -> sigv4::AwsCredentials {
        sigv4::AwsCredentials {
            access_key_id: "AKIDEXAMPLE".into(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY".into(),
            session_token: None,
        }
    }

    #[test]
    fn resolve_spec_sigv4_attaches_authorization_and_clears_auth() {
        // Exercise the sign+attach step with INJECTED credentials rather than a
        // stubbed ~/.aws under a temp HOME: mutating $HOME races other tests that
        // read dirs::home_dir() when cargo runs them in parallel.
        let mut spec = RequestSpec {
            id: "req-1".into(),
            method: "GET".into(),
            url: "https://example.amazonaws.com/".into(),
            headers: vec![],
            query_params: vec![],
            body: Body::None,
            auth: Auth::SigV4 {
                profile: "lok-test".into(),
                region: "us-east-1".into(),
                service: "service".into(),
            },
            options: RequestOptions::default(),
        };

        sign_and_attach(&mut spec, &sigv4_test_creds(), "us-east-1", "service").unwrap();

        assert!(matches!(spec.auth, Auth::None));
        let auth = spec
            .headers
            .iter()
            .find(|kv| kv.name.eq_ignore_ascii_case("authorization"))
            .expect("Authorization header attached");
        assert!(
            auth.value.starts_with("AWS4-HMAC-SHA256"),
            "got: {}",
            auth.value
        );
        assert!(spec
            .headers
            .iter()
            .any(|kv| kv.name.eq_ignore_ascii_case("x-amz-date")));
    }

    #[test]
    fn resolve_spec_sigv4_redacted_does_not_read_credentials() {
        // With redact=true, signing is skipped and no profile is read.
        let mut req = stored("https://example.amazonaws.com/");
        req.auth = Auth::SigV4 {
            profile: "definitely-absent-profile".into(),
            region: "us-east-1".into(),
            service: "service".into(),
        };
        let ctx = ctx_from(&[], &[]);
        let spec = resolve_spec(&req, &ctx, true).unwrap();
        assert!(matches!(spec.auth, Auth::None));
        let auth = spec
            .headers
            .iter()
            .find(|kv| kv.name.eq_ignore_ascii_case("authorization"))
            .unwrap();
        assert_eq!(auth.value, SECRET_PLACEHOLDER);
    }

    // ---------- e2e: resolve_and_send against a local server ----------

    // Ignored: these drive resolve_and_send, which reads the process-wide shared
    // store connection. store::tests serialise themselves behind their own lock
    // and wipe every table (DELETE FROM environments) in setup(); running in the
    // same process, that DELETE races the environment this test just inserted and
    // makes {{env.host}} resolve as unknown. Serialising cross-module would need a
    // shared lock in store.rs. Run explicitly with `--ignored`.
    #[test]
    #[ignore = "shares the process-wide store connection; races store::tests table resets"]
    fn resolve_and_send_hits_local_server_with_env_host() {
        crate::store::init_in_memory().unwrap();

        // Bind an ephemeral loopback port and serve one request on a thread.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap();
            let request_text = String::from_utf8_lossy(&buf[..n]).to_string();
            let body = "{\"ok\":true}";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.flush().unwrap();
            request_text
        });

        // Persist an environment whose host var points at the local server, then
        // send a stored request that interpolates {{env.host}} into the URL.
        let host = format!("{}:{}", addr.ip(), addr.port());
        let e = env("live", None, &[("host", &host)], &[]);
        crate::store::upsert_environment(e).unwrap();
        // The store rewrites empty ids; fetch the persisted id back.
        let saved = crate::store::list_environments()
            .unwrap()
            .into_iter()
            .find(|e| e.name == "live")
            .unwrap();

        let mut req = stored("http://{{env.host}}/health");
        req.headers = vec![KeyValue {
            name: "X-From".into(),
            value: "lokowka".into(),
            enabled: true,
        }];

        let response = tauri::async_runtime::block_on(resolve_and_send(req, Some(saved.id)))
            .expect("resolve_and_send succeeds");

        assert_eq!(response.status, 200);
        assert!(
            response.body.contains("\"ok\":true"),
            "body: {}",
            response.body
        );

        let request_text = server.join().unwrap();
        assert!(
            request_text.starts_with("GET /health "),
            "request line: {}",
            request_text.lines().next().unwrap_or("")
        );
        assert!(
            request_text
                .to_ascii_lowercase()
                .contains("x-from: lokowka"),
            "headers not forwarded: {request_text}"
        );
    }

    #[test]
    #[ignore = "shares the process-wide store connection; races store::tests table resets"]
    fn resolve_and_send_unknown_env_var_errors_before_network() {
        crate::store::init_in_memory().unwrap();
        // No environment id → empty ctx → {{env.host}} is unknown → error, and no
        // network call is attempted.
        let req = stored("http://{{env.host}}/x");
        let err = tauri::async_runtime::block_on(resolve_and_send(req, None)).unwrap_err();
        assert!(err.contains("host"), "got: {err}");
    }
}
