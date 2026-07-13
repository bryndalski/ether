//! The headless runner core for the `lok` CLI — the Tauri-free execution path.
//!
//! Flow (single request):
//!   store::init_path(db) → find target → resolve::build_resolved_spec →
//!   engine::execute_sync → assert::eval_assertions → RunReport.
//!
//! This module is a pure library surface (no arg parsing, no process exit) so
//! the integration tests drive `run_target` directly against a loopback server,
//! and `bin/lok.rs` only wires argv → this → an exit code.

use std::collections::HashMap;
use std::time::Instant;

use crate::assert::{self};
use crate::interp::RenderCtx;
use crate::models::StoredRequest;
use crate::report::{RunCase, RunReport, RunTarget};
use crate::{engine, resolve, store};

/// Exit-code classes — the CI contract (see docs/architecture/cli-lok.md §3.1).
pub const EXIT_OK: i32 = 0;
pub const EXIT_ASSERTION_FAILED: i32 = 1;
pub const EXIT_USAGE: i32 = 2;
pub const EXIT_TRANSPORT: i32 = 3;

/// Map a finished report to its exit code. Assertion failure (1) outranks a
/// transport error (3): a run that got responses but broke a contract is the
/// primary "tests red" signal; a pure connectivity failure with no assertions
/// is the distinct "endpoint down" class.
pub fn exit_code_for(report: &RunReport) -> i32 {
    if report.has_assertion_failure() {
        EXIT_ASSERTION_FAILED
    } else if report.has_transport_error() {
        EXIT_TRANSPORT
    } else {
        EXIT_OK
    }
}

/// Resolve an environment NAME to its stored id. `None` name → `None` id (run
/// with no environment). An unknown name is a usage error.
pub fn resolve_env_id(env_name: Option<&str>) -> Result<Option<String>, String> {
    let Some(name) = env_name else {
        return Ok(None);
    };
    let environments = store::list_environments()?;
    environments
        .into_iter()
        .find(|e| e.name == name)
        .map(|e| Some(e.id))
        .ok_or_else(|| format!("unknown environment name: {name}"))
}

/// What a `run` invocation resolved its positional target to. The single
/// request is boxed so the enum stays small (a `StoredRequest` is ~480 bytes),
/// matching `models::RequestSource::Request(Box<StoredRequest>)`.
#[derive(Debug)]
pub enum ResolvedTarget {
    Request(Box<StoredRequest>),
    Collection(String, Vec<StoredRequest>),
}

/// Disambiguate a positional id against the DB by lookup order (a UUID is unique
/// across tables, so at most one matches). Workflows are recognised but not yet
/// executable headless in v1 — a clear usage error beats a silent no-op.
pub fn resolve_target(target_id: &str) -> Result<ResolvedTarget, String> {
    if let Some(request) = store::get_request(target_id)? {
        return Ok(ResolvedTarget::Request(Box::new(request)));
    }
    if store::list_collections()?.iter().any(|c| c.id == target_id) {
        let requests = store::list_requests(Some(target_id.to_string()))?;
        return Ok(ResolvedTarget::Collection(target_id.to_string(), requests));
    }
    if store::workflow_list()?.iter().any(|w| w.id == target_id) {
        return Err(format!(
            "workflow targets are not yet supported by the lok CLI (id: {target_id})"
        ));
    }
    Err(format!("unknown target id: {target_id}"))
}

/// Execute one stored request from the DB: resolve `{{env.*}}`/`{{secret.*}}`
/// against the store, then send → evaluate. A resolve/transport error yields a
/// case with `transport_error` set and no assertion outcomes.
pub fn run_one_request(request: &StoredRequest, env_id: Option<&str>) -> RunCase {
    run_resolved(request, resolve::build_resolved_spec(request, env_id))
}

/// Execute one request WITHOUT the store: interpolate against an empty context
/// (no env, no secrets). This is the `--file` path — a request definition
/// committed to a repo, run in CI with nothing but its own literals. A template
/// reference like `{{env.x}}` is therefore an error, surfaced as a resolve
/// failure on the case.
pub fn run_one_request_no_store(request: &StoredRequest) -> RunCase {
    let ctx = RenderCtx {
        env: HashMap::new(),
        secrets: HashMap::new(),
        vars: HashMap::new(),
    };
    run_resolved(request, resolve::resolve_spec(request, &ctx, false))
}

/// Shared execute + assert core: given a resolved spec (or a resolve error),
/// send it and fold the response's assertion outcomes into one `RunCase`.
fn run_resolved(
    request: &StoredRequest,
    resolved: Result<crate::models::RequestSpec, String>,
) -> RunCase {
    let spec = match resolved {
        Ok(spec) => spec,
        Err(err) => {
            return RunCase {
                request_id: request.id.clone(),
                name: request.name.clone(),
                method: request.method.clone(),
                url: request.url.clone(),
                status: 0,
                total_ms: 0.0,
                transport_error: Some(format!("resolve failed: {err}")),
                assertions: vec![],
            };
        }
    };

    let started = Instant::now();
    match engine::execute_sync(spec) {
        Ok(response) => {
            let outcomes = assert::eval_assertions(&response, &request.assertions);
            RunCase {
                request_id: request.id.clone(),
                name: request.name.clone(),
                method: request.method.clone(),
                url: response.effective_url.clone(),
                status: response.status,
                total_ms: response.timings.total_ms,
                transport_error: None,
                assertions: outcomes,
            }
        }
        Err(err) => RunCase {
            request_id: request.id.clone(),
            name: request.name.clone(),
            method: request.method.clone(),
            url: request.url.clone(),
            status: 0,
            total_ms: started.elapsed().as_secs_f64() * 1000.0,
            transport_error: Some(err),
            assertions: vec![],
        },
    }
}

/// Run a resolved target (single request or a whole collection in sort order)
/// and aggregate into one `RunReport`.
pub fn run_target(target: ResolvedTarget, env_id: Option<&str>) -> RunReport {
    let started_at = now_rfc3339();
    let clock = Instant::now();

    let (run_target, cases) = match target {
        ResolvedTarget::Request(request) => {
            let case = run_one_request(&request, env_id);
            (RunTarget::Request(request.id.clone()), vec![case])
        }
        ResolvedTarget::Collection(id, requests) => {
            let cases = requests
                .iter()
                .map(|request| run_one_request(request, env_id))
                .collect();
            (RunTarget::Collection(id), cases)
        }
    };

    let duration_ms = clock.elapsed().as_secs_f64() * 1000.0;
    RunReport::new(run_target, started_at, cases, duration_ms)
}

/// Run a single request loaded from an exported JSON file, without touching the
/// DB (init skipped) — interpolated against an empty context. Assertions still
/// evaluated.
pub fn run_file_request(request: &StoredRequest, path: &str) -> RunReport {
    let started_at = now_rfc3339();
    let clock = Instant::now();
    let case = run_one_request_no_store(request);
    let duration_ms = clock.elapsed().as_secs_f64() * 1000.0;
    RunReport::new(
        RunTarget::File(path.to_string()),
        started_at,
        vec![case],
        duration_ms,
    )
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}
