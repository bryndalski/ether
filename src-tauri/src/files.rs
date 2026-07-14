//! Local file export — the "save this response" path. Writes ONLY to a path
//! the user just picked in the native save panel (tauri-plugin-dialog); there
//! is no free-form filesystem access from the frontend.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

/// Write a response body to `path`. `is_base64` mirrors the engine's flag for
/// binary bodies — those are decoded back to raw bytes before writing, so a
/// saved PNG is a PNG, not its base64 text.
#[tauri::command]
pub fn save_body_to_file(path: String, contents: String, is_base64: bool) -> Result<(), String> {
    let bytes = if is_base64 {
        BASE64
            .decode(contents.as_bytes())
            .map_err(|e| format!("base64 decode failed: {e}"))?
    } else {
        contents.into_bytes()
    };
    std::fs::write(&path, bytes).map_err(|e| format!("write failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_text_and_decodes_base64() {
        let dir = std::env::temp_dir();
        let text_path = dir.join("ether-save-test.txt");
        save_body_to_file(
            text_path.to_string_lossy().into_owned(),
            "hello".into(),
            false,
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&text_path).unwrap(), "hello");

        let bin_path = dir.join("ether-save-test.bin");
        save_body_to_file(
            bin_path.to_string_lossy().into_owned(),
            BASE64.encode([0u8, 159, 146, 150]),
            true,
        )
        .unwrap();
        assert_eq!(std::fs::read(&bin_path).unwrap(), vec![0u8, 159, 146, 150]);
        let _ = std::fs::remove_file(text_path);
        let _ = std::fs::remove_file(bin_path);
    }

    #[test]
    fn bad_base64_is_an_error_not_a_panic() {
        let path = std::env::temp_dir().join("ether-save-test-bad.bin");
        let result = save_body_to_file(
            path.to_string_lossy().into_owned(),
            "not-valid-base64!!!".into(),
            true,
        );
        assert!(result.is_err());
    }
}
