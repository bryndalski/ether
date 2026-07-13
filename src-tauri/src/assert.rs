//! Rust port of the frontend's scriptless assertion evaluator
//! (`src/lib/assertions.ts`, `evalAssertions`). The desktop app evaluates the
//! 9 assertion types in TypeScript; the headless `lok` CLI runs them in Rust so
//! a CI pass is byte-for-byte the GUI's verdict.
//!
//! Parity is guaranteed by reusing `json_path::{resolve, value_matches_expected}`
//! — the exact Rust twin of the TS JSONPath — rather than re-inventing the
//! grammar. `eval_assertions` is total and side-effect-free: a malformed
//! assertion or a non-JSON body yields a `Fail` with a diagnostic, never a
//! panic (same guarantee as `evalAssertions`). Messages are plain English
//! literals — the CLI is English-only (Ether marka) and pulls in no i18n.

use serde::{Deserialize, Serialize};

use crate::json_path;
use crate::models::{Assertion, ResponseData};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssertStatus {
    Pass,
    Fail,
    Skipped,
}

/// One assertion's verdict. Mirrors the TS `AssertionResult` (minus the raw
/// `assertion` echo — the reporters carry the request context instead).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssertOutcome {
    pub index: usize,
    pub status: AssertStatus,
    /// Human label, e.g. "status == 200".
    pub label: String,
    /// Verdict message, e.g. "status 200 == 200" | "expected 200, got 404".
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssertSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub all_passed: bool,
}

/// Case-insensitive header join (multi-value → ", "), port of `joinHeader`.
fn join_header(headers: &[crate::models::KeyValue], name: &str) -> (bool, String) {
    let lower = name.to_ascii_lowercase();
    let matches: Vec<&str> = headers
        .iter()
        .filter(|kv| kv.name.to_ascii_lowercase() == lower)
        .map(|kv| kv.value.as_str())
        .collect();
    (!matches.is_empty(), matches.join(", "))
}

/// Port of `jsonType` in `jsonDiff.ts`: null / array / boolean / number /
/// string / object.
fn json_type(node: &serde_json::Value) -> &'static str {
    match node {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

/// A body cannot be pathed into (binary) — mirrors `bodyIsBinary`.
fn body_is_binary(response: &ResponseData) -> bool {
    response.body_is_base64
}

fn pass(index: usize, label: String, message: String) -> AssertOutcome {
    AssertOutcome {
        index,
        status: AssertStatus::Pass,
        label,
        message,
        expected: None,
        actual: None,
    }
}

fn fail(
    index: usize,
    label: String,
    message: String,
    expected: Option<String>,
    actual: Option<String>,
) -> AssertOutcome {
    AssertOutcome {
        index,
        status: AssertStatus::Fail,
        label,
        message,
        expected,
        actual,
    }
}

/// The `enabled` flag on any variant — a disabled assertion is `Skipped`.
fn is_enabled(assertion: &Assertion) -> bool {
    match assertion {
        Assertion::StatusEquals { enabled, .. }
        | Assertion::StatusInRange { enabled, .. }
        | Assertion::HeaderExists { enabled, .. }
        | Assertion::HeaderEquals { enabled, .. }
        | Assertion::JsonPathExists { enabled, .. }
        | Assertion::JsonPathEquals { enabled, .. }
        | Assertion::JsonPathType { enabled, .. }
        | Assertion::BodyContains { enabled, .. }
        | Assertion::ResponseTimeBelow { enabled, .. } => *enabled,
    }
}

/// A short, human label for an assertion (English, i18n-free).
fn label_of(assertion: &Assertion) -> String {
    match assertion {
        Assertion::StatusEquals { expected, .. } => format!("status == {expected}"),
        Assertion::StatusInRange { min, max, .. } => format!("status in {min}..={max}"),
        Assertion::HeaderExists { name, .. } => format!("header {name} exists"),
        Assertion::HeaderEquals { name, expected, .. } => format!("header {name} == {expected}"),
        Assertion::JsonPathExists { path, .. } => format!("{path} exists"),
        Assertion::JsonPathEquals { path, expected, .. } => format!("{path} == {expected}"),
        Assertion::JsonPathType {
            path,
            expected_type,
            ..
        } => format!("{path} type {expected_type}"),
        Assertion::BodyContains { substring, .. } => format!("body contains {substring:?}"),
        Assertion::ResponseTimeBelow { max_ms, .. } => format!("response time < {max_ms}ms"),
    }
}

/// Evaluate every assertion against a response, in list order with a stable
/// `index`. The body is parsed at most once and shared across all `json_path_*`
/// checks (mirrors `evalAssertions`' parse cache). Total: never panics.
pub fn eval_assertions(response: &ResponseData, assertions: &[Assertion]) -> Vec<AssertOutcome> {
    let mut parsed_cache: Option<Result<serde_json::Value, String>> = None;
    let mut parse_body = || -> Result<serde_json::Value, String> {
        if parsed_cache.is_none() {
            let trimmed = response.body.trim();
            let parsed = if trimmed.is_empty() {
                Err("empty body".to_string())
            } else {
                serde_json::from_str::<serde_json::Value>(trimmed)
                    .map_err(|_| "non-JSON body".to_string())
            };
            parsed_cache = Some(parsed);
        }
        parsed_cache.clone().expect("parse cache primed above")
    };

    assertions
        .iter()
        .enumerate()
        .map(|(index, assertion)| {
            let label = label_of(assertion);
            if !is_enabled(assertion) {
                return AssertOutcome {
                    index,
                    status: AssertStatus::Skipped,
                    label,
                    message: "disabled".to_string(),
                    expected: None,
                    actual: None,
                };
            }
            eval_one(response, assertion, index, label, &mut parse_body)
        })
        .collect()
}

fn eval_one(
    response: &ResponseData,
    assertion: &Assertion,
    index: usize,
    label: String,
    parse_body: &mut dyn FnMut() -> Result<serde_json::Value, String>,
) -> AssertOutcome {
    match assertion {
        Assertion::StatusEquals { expected, .. } => {
            let expected = u32::from(*expected);
            if response.status == expected {
                pass(
                    index,
                    label,
                    format!("status {} == {expected}", response.status),
                )
            } else {
                fail(
                    index,
                    label,
                    format!("expected {expected}, got {}", response.status),
                    Some(expected.to_string()),
                    Some(response.status.to_string()),
                )
            }
        }
        Assertion::StatusInRange { min, max, .. } => {
            let (min, max) = (u32::from(*min), u32::from(*max));
            if response.status >= min && response.status <= max {
                pass(
                    index,
                    label,
                    format!("status {} in {min}..={max}", response.status),
                )
            } else {
                fail(
                    index,
                    label,
                    format!("status {} out of range {min}..={max}", response.status),
                    Some(format!("{min}..={max}")),
                    Some(response.status.to_string()),
                )
            }
        }
        Assertion::HeaderExists { name, .. } => {
            let (present, _) = join_header(&response.headers, name);
            if present {
                pass(index, label, format!("header {name} present"))
            } else {
                fail(index, label, format!("header {name} missing"), None, None)
            }
        }
        Assertion::HeaderEquals { name, expected, .. } => {
            let (present, value) = join_header(&response.headers, name);
            if !present {
                return fail(
                    index,
                    label,
                    format!("header {name} missing"),
                    Some(expected.clone()),
                    None,
                );
            }
            if value == *expected {
                pass(index, label, format!("header {name} == {expected}"))
            } else {
                fail(
                    index,
                    label,
                    format!("header {name}: expected {expected}, got {value}"),
                    Some(expected.clone()),
                    Some(value),
                )
            }
        }
        Assertion::JsonPathExists { path, .. } => with_json(
            response,
            index,
            label,
            path,
            None,
            parse_body,
            |root, label| {
                let resolved = json_path::resolve(root, path);
                if resolved.found {
                    Ok(pass(index, label, format!("{path} exists")))
                } else {
                    Err(fail(index, label, format!("{path} not found"), None, None))
                }
            },
        ),
        Assertion::JsonPathEquals { path, expected, .. } => {
            let expected_clone = expected.clone();
            with_json(
                response,
                index,
                label,
                path,
                Some(expected.clone()),
                parse_body,
                move |root, label| {
                    let resolved = json_path::resolve(root, path);
                    if !resolved.found {
                        return Err(fail(
                            index,
                            label,
                            format!("{path} not found"),
                            Some(expected_clone.clone()),
                            None,
                        ));
                    }
                    if json_path::value_matches_expected(&resolved.value, &expected_clone) {
                        Ok(pass(index, label, format!("{path} == {expected_clone}")))
                    } else {
                        Err(fail(
                            index,
                            label,
                            format!("{path}: expected {expected_clone}, got {}", resolved.value),
                            Some(expected_clone.clone()),
                            Some(resolved.value.to_string()),
                        ))
                    }
                },
            )
        }
        Assertion::JsonPathType {
            path,
            expected_type,
            ..
        } => {
            let expected_type_clone = expected_type.clone();
            with_json(
                response,
                index,
                label,
                path,
                Some(expected_type.clone()),
                parse_body,
                move |root, label| {
                    let resolved = json_path::resolve(root, path);
                    if !resolved.found {
                        return Err(fail(
                            index,
                            label,
                            format!("{path} not found"),
                            Some(expected_type_clone.clone()),
                            None,
                        ));
                    }
                    let actual_type = json_type(&resolved.value);
                    if actual_type == expected_type_clone {
                        Ok(pass(index, label, format!("{path} type {actual_type}")))
                    } else {
                        Err(fail(
                            index,
                            label,
                            format!(
                                "{path}: expected type {expected_type_clone}, got {actual_type}"
                            ),
                            Some(expected_type_clone.clone()),
                            Some(actual_type.to_string()),
                        ))
                    }
                },
            )
        }
        Assertion::BodyContains { substring, .. } => {
            if body_is_binary(response) {
                return fail(
                    index,
                    label,
                    "binary body — text unavailable".to_string(),
                    Some(substring.clone()),
                    None,
                );
            }
            if response.body.contains(substring.as_str()) {
                pass(index, label, format!("body contains {substring:?}"))
            } else {
                fail(
                    index,
                    label,
                    format!("body does not contain {substring:?}"),
                    Some(substring.clone()),
                    None,
                )
            }
        }
        Assertion::ResponseTimeBelow { max_ms, .. } => {
            let total = response.timings.total_ms;
            if total < *max_ms {
                pass(index, label, format!("{total:.0}ms < {max_ms}ms"))
            } else {
                fail(
                    index,
                    label,
                    format!("{total:.0}ms >= {max_ms}ms"),
                    Some(format!("< {max_ms} ms")),
                    Some(format!("{total:.0} ms")),
                )
            }
        }
    }
}

/// Shared body guard for the three `json_path_*` types: fail (never panic) when
/// the body is binary or non-JSON, otherwise run the check against the parsed
/// root. The closure returns `Ok(pass)` / `Err(fail)` so the guard folds both.
fn with_json(
    response: &ResponseData,
    index: usize,
    label: String,
    path: &str,
    expected: Option<String>,
    parse_body: &mut dyn FnMut() -> Result<serde_json::Value, String>,
    check: impl FnOnce(&serde_json::Value, String) -> Result<AssertOutcome, AssertOutcome>,
) -> AssertOutcome {
    if body_is_binary(response) {
        return fail(
            index,
            label,
            format!("binary body — cannot check {path}"),
            expected,
            None,
        );
    }
    match parse_body() {
        Ok(root) => match check(&root, label) {
            Ok(outcome) | Err(outcome) => outcome,
        },
        Err(reason) => fail(
            index,
            label,
            format!("{reason} — cannot check {path}"),
            expected,
            None,
        ),
    }
}

/// Total & `all_passed` across a set of outcomes. `all_passed` iff zero failures
/// (skipped assertions do not fail a run), mirroring `summarize` in the TS.
pub fn summarize(outcomes: &[AssertOutcome]) -> AssertSummary {
    let mut passed = 0;
    let mut failed = 0;
    let mut skipped = 0;
    for outcome in outcomes {
        match outcome.status {
            AssertStatus::Pass => passed += 1,
            AssertStatus::Fail => failed += 1,
            AssertStatus::Skipped => skipped += 1,
        }
    }
    AssertSummary {
        total: outcomes.len(),
        passed,
        failed,
        skipped,
        all_passed: failed == 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{KeyValue, Timings};

    fn response(status: u32, body: &str, headers: &[(&str, &str)]) -> ResponseData {
        ResponseData {
            request_id: "req".into(),
            status,
            http_version: "HTTP/1.1".into(),
            headers: headers
                .iter()
                .map(|(name, value)| KeyValue {
                    name: name.to_string(),
                    value: value.to_string(),
                    enabled: true,
                })
                .collect(),
            body: body.into(),
            body_is_base64: false,
            body_truncated_at: None,
            size_download_bytes: body.len() as u64,
            timings: Timings {
                total_ms: 42.0,
                ..Timings::default()
            },
            effective_url: "http://x/".into(),
            redirect_chain: vec![],
            verbose_log: String::new(),
            tls: None,
        }
    }

    #[test]
    fn status_equals_pass_and_fail() {
        let r = response(200, "{}", &[]);
        let pass = eval_assertions(
            &r,
            &[Assertion::StatusEquals {
                expected: 200,
                enabled: true,
            }],
        );
        assert_eq!(pass[0].status, AssertStatus::Pass);

        let fail = eval_assertions(
            &r,
            &[Assertion::StatusEquals {
                expected: 404,
                enabled: true,
            }],
        );
        assert_eq!(fail[0].status, AssertStatus::Fail);
        assert_eq!(fail[0].expected.as_deref(), Some("404"));
        assert_eq!(fail[0].actual.as_deref(), Some("200"));
    }

    #[test]
    fn status_in_range_boundaries() {
        let r = response(204, "{}", &[]);
        let inside = eval_assertions(
            &r,
            &[Assertion::StatusInRange {
                min: 200,
                max: 299,
                enabled: true,
            }],
        );
        assert_eq!(inside[0].status, AssertStatus::Pass);
        let outside = eval_assertions(
            &r,
            &[Assertion::StatusInRange {
                min: 200,
                max: 203,
                enabled: true,
            }],
        );
        assert_eq!(outside[0].status, AssertStatus::Fail);
    }

    #[test]
    fn header_exists_and_equals_case_insensitive_and_multivalue() {
        let r = response(200, "{}", &[("Set-Cookie", "a"), ("set-cookie", "b")]);
        let exists = eval_assertions(
            &r,
            &[Assertion::HeaderExists {
                name: "SET-COOKIE".into(),
                enabled: true,
            }],
        );
        assert_eq!(exists[0].status, AssertStatus::Pass);

        // Multi-value join is ", " — case-insensitive match on the name.
        let equals = eval_assertions(
            &r,
            &[Assertion::HeaderEquals {
                name: "set-cookie".into(),
                expected: "a, b".into(),
                enabled: true,
            }],
        );
        assert_eq!(equals[0].status, AssertStatus::Pass);

        let missing = eval_assertions(
            &r,
            &[Assertion::HeaderExists {
                name: "x-nope".into(),
                enabled: true,
            }],
        );
        assert_eq!(missing[0].status, AssertStatus::Fail);
    }

    #[test]
    fn json_path_exists_equals_type_with_lenient_coercion() {
        let r = response(200, r#"{"count": 200, "items": [1, 2], "name": "ok"}"#, &[]);
        let outcomes = eval_assertions(
            &r,
            &[
                Assertion::JsonPathExists {
                    path: "$.count".into(),
                    enabled: true,
                },
                // Lenient: "200" (string) matches 200 (number).
                Assertion::JsonPathEquals {
                    path: "$.count".into(),
                    expected: "200".into(),
                    enabled: true,
                },
                Assertion::JsonPathType {
                    path: "$.items".into(),
                    expected_type: "array".into(),
                    enabled: true,
                },
                Assertion::JsonPathExists {
                    path: "$.missing".into(),
                    enabled: true,
                },
            ],
        );
        assert_eq!(outcomes[0].status, AssertStatus::Pass);
        assert_eq!(outcomes[1].status, AssertStatus::Pass);
        assert_eq!(outcomes[2].status, AssertStatus::Pass);
        assert_eq!(outcomes[3].status, AssertStatus::Fail);
    }

    #[test]
    fn body_contains_and_response_time() {
        let r = response(200, "hello world", &[]);
        let contains = eval_assertions(
            &r,
            &[Assertion::BodyContains {
                substring: "world".into(),
                enabled: true,
            }],
        );
        assert_eq!(contains[0].status, AssertStatus::Pass);

        let time = eval_assertions(
            &r,
            &[Assertion::ResponseTimeBelow {
                max_ms: 100.0,
                enabled: true,
            }],
        );
        assert_eq!(time[0].status, AssertStatus::Pass);
        let slow = eval_assertions(
            &r,
            &[Assertion::ResponseTimeBelow {
                max_ms: 10.0,
                enabled: true,
            }],
        );
        assert_eq!(slow[0].status, AssertStatus::Fail);
    }

    #[test]
    fn binary_body_fails_json_and_contains_without_panic() {
        let mut r = response(200, "not-json", &[]);
        r.body_is_base64 = true;
        let outcomes = eval_assertions(
            &r,
            &[
                Assertion::JsonPathExists {
                    path: "$.a".into(),
                    enabled: true,
                },
                Assertion::BodyContains {
                    substring: "x".into(),
                    enabled: true,
                },
            ],
        );
        assert_eq!(outcomes[0].status, AssertStatus::Fail);
        assert_eq!(outcomes[1].status, AssertStatus::Fail);
    }

    #[test]
    fn malformed_json_body_fails_json_path_with_diagnostic() {
        let r = response(200, "<html/>", &[]);
        let outcomes = eval_assertions(
            &r,
            &[Assertion::JsonPathExists {
                path: "$.a".into(),
                enabled: true,
            }],
        );
        assert_eq!(outcomes[0].status, AssertStatus::Fail);
        assert!(outcomes[0].message.contains("non-JSON"));
    }

    #[test]
    fn disabled_assertion_is_skipped() {
        let r = response(500, "{}", &[]);
        let outcomes = eval_assertions(
            &r,
            &[Assertion::StatusEquals {
                expected: 200,
                enabled: false,
            }],
        );
        assert_eq!(outcomes[0].status, AssertStatus::Skipped);
    }

    #[test]
    fn summarize_totals_and_all_passed() {
        let r = response(200, r#"{"a": 1}"#, &[]);
        let outcomes = eval_assertions(
            &r,
            &[
                Assertion::StatusEquals {
                    expected: 200,
                    enabled: true,
                },
                Assertion::StatusEquals {
                    expected: 404,
                    enabled: true,
                },
                Assertion::StatusEquals {
                    expected: 200,
                    enabled: false,
                },
            ],
        );
        let summary = summarize(&outcomes);
        assert_eq!(summary.total, 3);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.skipped, 1);
        assert!(!summary.all_passed);
    }
}
