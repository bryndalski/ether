//! HTTP engine on libcurl (crate `curl`). Owns request execution,
//! cancellation, cookie jars, redirects (with cross-host Authorization
//! strip), timings and the verbose transfer log.

use crate::models::{RequestSpec, ResponseData};

/// Execute a fully-resolved request through libcurl on a blocking thread.
#[tauri::command]
pub async fn execute_request(spec: RequestSpec) -> Result<ResponseData, String> {
    let _ = spec;
    Err("not implemented: engine::execute_request".into())
}

/// Cancel an in-flight request by its correlation id.
#[tauri::command]
pub fn cancel_request(request_id: String) -> Result<bool, String> {
    let _ = request_id;
    Err("not implemented: engine::cancel_request".into())
}
