//! Minimal, dependency-free dot/bracket JSONPath — a direct Rust port of
//! `resolveJsonPath` in `src/lib/assertions.ts`. Same grammar (`$`, `$.a`,
//! `$.a.b`, `$.items[2]`, `$.items[2].id`), same `{ found, value }` result, same
//! lenient equality (`valueMatchesExpected`). Porting (not re-inventing)
//! guarantees an Extract/Condition on the workflow canvas matches an assertion
//! with the same path. No wildcards, no filters — a closed grammar on purpose.

use serde_json::Value;

/// A resolved JSONPath node plus whether the path actually exists in the tree (a
/// present `null` node still "exists").
#[derive(Debug, Clone, PartialEq)]
pub struct Resolved {
    pub found: bool,
    pub value: Value,
}

fn not_found() -> Resolved {
    Resolved {
        found: false,
        value: Value::Null,
    }
}

/// Resolve a JSONPath against a parsed JSON root.
pub fn resolve(root: &Value, path: &str) -> Resolved {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "$" {
        return Resolved {
            found: true,
            value: root.clone(),
        };
    }
    if !trimmed.starts_with('$') {
        return not_found();
    }

    let mut current = root;
    for token in tokenize(&trimmed[1..]) {
        match token {
            Token::Key(key) => match current {
                Value::Object(map) => match map.get(&key) {
                    Some(next) => current = next,
                    None => return not_found(),
                },
                _ => return not_found(),
            },
            Token::Index(index) => match current {
                Value::Array(items) => match items.get(index) {
                    Some(next) => current = next,
                    None => return not_found(),
                },
                _ => return not_found(),
            },
        }
    }
    Resolved {
        found: true,
        value: current.clone(),
    }
}

/// Lenient coercion mirroring `valueMatchesExpected` in assertions.ts: if
/// `expected` parses as JSON, compare structurally; otherwise compare the node's
/// string form to `expected`. So `"200"↔200`, `"true"↔true`, `"x"↔"x"`.
pub fn value_matches_expected(node: &Value, expected: &str) -> bool {
    if let Ok(parsed) = serde_json::from_str::<Value>(expected) {
        if &parsed == node {
            return true;
        }
    }
    stringify(node) == expected
}

/// String form of a node for a plain (non-JSON) comparison — a bare string keeps
/// its text, everything else uses its JSON serialization (matching JS `String()`
/// closely enough for the leaf types a response body carries).
fn stringify(node: &Value) -> String {
    match node {
        Value::String(text) => text.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

enum Token {
    Key(String),
    Index(usize),
}

/// Split the path body (everything after the leading `$`) into `.key` and
/// `[index]` tokens. Mirrors the JS regex `\.[^.[\]]+|\[\d+\]`; malformed
/// fragments are skipped, which the callers treat as "not found".
fn tokenize(body: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'.' => {
                let start = i + 1;
                let mut j = start;
                while j < bytes.len() && bytes[j] != b'.' && bytes[j] != b'[' {
                    j += 1;
                }
                if j > start {
                    tokens.push(Token::Key(body[start..j].to_string()));
                }
                i = j;
            }
            b'[' => {
                if let Some(close) = body[i..].find(']') {
                    let inner = &body[i + 1..i + close];
                    if let Ok(index) = inner.parse::<usize>() {
                        tokens.push(Token::Index(index));
                    }
                    i += close + 1;
                } else {
                    break;
                }
            }
            _ => {
                // Unexpected leading char (not `.` or `[`) — skip it.
                i += 1;
            }
        }
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn root_and_dollar_return_whole_tree() {
        let root = json!({"a": 1});
        assert_eq!(resolve(&root, "$").value, root);
        assert_eq!(resolve(&root, "").value, root);
        assert!(resolve(&root, "$").found);
    }

    #[test]
    fn nested_object_path() {
        let root = json!({"a": {"b": "deep"}});
        let got = resolve(&root, "$.a.b");
        assert!(got.found);
        assert_eq!(got.value, json!("deep"));
    }

    #[test]
    fn array_index_path() {
        let root = json!({"items": [{"id": 10}, {"id": 20}, {"id": 30}]});
        let got = resolve(&root, "$.items[2].id");
        assert!(got.found);
        assert_eq!(got.value, json!(30));
    }

    #[test]
    fn missing_key_is_not_found() {
        let root = json!({"a": 1});
        assert_eq!(resolve(&root, "$.nope"), not_found());
        assert_eq!(resolve(&root, "$.a.b"), not_found());
    }

    #[test]
    fn present_null_still_exists() {
        let root = json!({"a": null});
        let got = resolve(&root, "$.a");
        assert!(got.found, "a present null node exists");
        assert_eq!(got.value, Value::Null);
    }

    #[test]
    fn index_out_of_bounds_is_not_found() {
        let root = json!({"items": [1, 2]});
        assert_eq!(resolve(&root, "$.items[5]"), not_found());
    }

    #[test]
    fn lenient_equality_coerces_numbers_and_bools() {
        assert!(value_matches_expected(&json!(200), "200"));
        assert!(value_matches_expected(&json!(true), "true"));
        assert!(value_matches_expected(&json!("abc"), "abc"));
        assert!(!value_matches_expected(&json!(200), "404"));
    }

    #[test]
    fn non_object_path_walk_fails_cleanly() {
        let root = json!(42);
        assert_eq!(resolve(&root, "$.a"), not_found());
    }
}
