//! Closed, non-Turing-complete interpolation engine.
//! Syntax: {{env.NAME}}, {{secret.NAME}}, {{$uuid}}, {{$timestamp}},
//! {{$random.int(a,b)}}, {{$datetime.iso}}, {{$base64(...)}} …
//! Context-aware escaping (URL vs JSON vs header), iterative expansion with
//! cycle detection. NEVER embed a general template engine here (Insomnia's
//! Nunjucks template-injection CVE is the cautionary tale).

use std::collections::HashMap;

/// Rendering context: resolved variable maps. Secrets are injected by the
/// caller just-in-time and must never be persisted with the result.
#[derive(Debug, Default, Clone)]
pub struct RenderCtx {
    pub env: HashMap<String, String>,
    pub secrets: HashMap<String, String>,
}

/// Where the rendered value lands — drives escaping rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderTarget {
    Url,
    Header,
    JsonBody,
    RawText,
}

/// Render a template string against the context.
pub fn render(input: &str, ctx: &RenderCtx, target: RenderTarget) -> Result<String, String> {
    let _ = (input, ctx, target);
    Err("not implemented: interp::render".into())
}

/// Preview interpolation for the UI (secrets masked as ••••).
#[tauri::command]
pub fn preview_template(input: String, environment_id: Option<String>) -> Result<String, String> {
    let _ = (input, environment_id);
    Err("not implemented: interp::preview_template".into())
}
