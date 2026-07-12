//! Secret storage backed by the macOS Keychain (crate `keyring`).
//! Values NEVER land in SQLite, exports, clipboard or logs — the rest of the
//! app refers to secrets only by name via {{secret.NAME}}.

const SERVICE: &str = "com.bryndalski.lokowka";

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let _ = (name, value, SERVICE);
    Err("not implemented: secrets::secret_set".into())
}

/// Internal use (interpolation) — the UI only ever shows masked values.
pub fn secret_get(name: &str) -> Result<String, String> {
    let _ = name;
    Err("not implemented: secrets::secret_get".into())
}

#[tauri::command]
pub fn secret_exists(name: String) -> Result<bool, String> {
    let _ = name;
    Err("not implemented: secrets::secret_exists".into())
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    let _ = name;
    Err("not implemented: secrets::secret_delete".into())
}
