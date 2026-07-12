//! Secret storage backed by the macOS Keychain (crate `keyring`).
//! Values NEVER land in SQLite, exports, clipboard or logs — the rest of the
//! app refers to secrets only by name via {{secret.NAME}}.

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "com.bryndalski.lokowka";

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

/// Internal use (interpolation) — the UI only ever shows masked values.
pub fn secret_get(name: &str) -> Result<String, String> {
    entry(name)?.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_exists(name: String) -> Result<bool, String> {
    match entry(&name)?.get_password() {
        Ok(_) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_construction_does_not_touch_keychain() {
        // Building an Entry is pure; no Keychain prompt or write happens.
        assert!(entry("lokowka-unit-noop").is_ok());
    }

    /// Full round-trip against the real macOS Keychain. Ignored by default so CI
    /// and offline runs never prompt for Keychain access.
    #[test]
    #[ignore = "touches the real macOS Keychain"]
    fn set_get_exists_delete_roundtrip() {
        let name = "lokowka-test-secret";
        secret_set(name.into(), "sk-live-xyz".into()).unwrap();
        assert!(secret_exists(name.into()).unwrap());
        assert_eq!(secret_get(name).unwrap(), "sk-live-xyz");
        secret_delete(name.into()).unwrap();
        assert!(!secret_exists(name.into()).unwrap());
    }

    #[test]
    #[ignore = "touches the real macOS Keychain"]
    fn delete_absent_is_ok() {
        secret_delete("lokowka-absent-secret".into()).unwrap();
        assert!(!secret_exists("lokowka-absent-secret".into()).unwrap());
    }
}
