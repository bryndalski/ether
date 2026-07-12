//! Two-way curl round-trip: RequestSpec -> curl command (1:1 with what the
//! engine executes) and curl command -> RequestSpec (tolerant parser).
//! `redact: true` masks secret values for clipboard/sharing.

use crate::models::RequestSpec;

#[tauri::command]
pub fn to_curl(spec: RequestSpec, redact: bool) -> Result<String, String> {
    let _ = (spec, redact);
    Err("not implemented: curlgen::to_curl".into())
}

#[tauri::command]
pub fn from_curl(command: String) -> Result<RequestSpec, String> {
    let _ = command;
    Err("not implemented: curlgen::from_curl".into())
}
