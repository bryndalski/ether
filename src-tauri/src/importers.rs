//! Importers: Postman v2.1, Insomnia v4, HAR, .http/.rest (JetBrains
//! dialect, tolerant), curl commands from ~/.zsh_history.

use crate::models::ImportResult;

#[tauri::command]
pub fn import_postman(json: String) -> Result<ImportResult, String> {
    let _ = json;
    Err("not implemented: importers::import_postman".into())
}

#[tauri::command]
pub fn import_insomnia(json: String) -> Result<ImportResult, String> {
    let _ = json;
    Err("not implemented: importers::import_insomnia".into())
}

#[tauri::command]
pub fn import_har(json: String) -> Result<ImportResult, String> {
    let _ = json;
    Err("not implemented: importers::import_har".into())
}

#[tauri::command]
pub fn import_http_file(text: String) -> Result<ImportResult, String> {
    let _ = text;
    Err("not implemented: importers::import_http_file".into())
}

/// Scan ~/.zsh_history (and ~/.bash_history) for curl invocations and return
/// the raw commands, newest first, deduplicated.
#[tauri::command]
pub fn scan_shell_history_curls(limit: Option<u32>) -> Result<Vec<String>, String> {
    let _ = limit;
    Err("not implemented: importers::scan_shell_history_curls".into())
}
