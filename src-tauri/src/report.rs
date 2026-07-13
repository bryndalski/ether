//! The aggregate run result (`RunReport`) plus the three pure reporters
//! (JUnit XML / JSON / HTML). `RunReport` is the ONLY thing reporters see — they
//! are pure `fn(&RunReport) -> String`, so the runner (network + assertions) and
//! the reporters (formatting) never mix. No template/XML crate: the output
//! shapes are small and stable, and hand-rolled escaping keeps the bin dep-light.

use serde::{Deserialize, Serialize};

use crate::assert::{AssertOutcome, AssertStatus};

/// What a run targeted (drives the JUnit suite name / exit-code context).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum RunTarget {
    Request(String),
    Collection(String),
    Workflow(String),
    File(String),
}

impl RunTarget {
    fn display(&self) -> String {
        match self {
            RunTarget::Request(id) => format!("request: {id}"),
            RunTarget::Collection(id) => format!("collection: {id}"),
            RunTarget::Workflow(id) => format!("workflow: {id}"),
            RunTarget::File(path) => format!("file: {path}"),
        }
    }
}

/// One executed request (or workflow node) plus its assertion outcomes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunCase {
    pub request_id: String,
    pub name: String,
    pub method: String,
    /// effective_url (post-redirect); never carries a secret query value.
    pub url: String,
    pub status: u32,
    pub total_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_error: Option<String>,
    pub assertions: Vec<AssertOutcome>,
}

impl RunCase {
    /// A case is failing when the transfer errored or any assertion failed.
    pub fn is_failing(&self) -> bool {
        self.transport_error.is_some()
            || self
                .assertions
                .iter()
                .any(|a| a.status == AssertStatus::Fail)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RunSummary {
    pub cases: usize,
    pub cases_failed: usize,
    pub assertions_total: usize,
    pub assertions_passed: usize,
    pub assertions_failed: usize,
    pub assertions_skipped: usize,
    pub all_green: bool,
    pub duration_ms: f64,
}

/// The single structure every reporter formats and the exit code derives from.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunReport {
    pub target: RunTarget,
    pub started_at: String,
    pub cases: Vec<RunCase>,
    pub summary: RunSummary,
}

impl RunReport {
    /// Build a report from executed cases, computing the summary in one place.
    pub fn new(
        target: RunTarget,
        started_at: String,
        cases: Vec<RunCase>,
        duration_ms: f64,
    ) -> Self {
        let summary = summarize_cases(&cases, duration_ms);
        Self {
            target,
            started_at,
            cases,
            summary,
        }
    }

    /// True when at least one case has a transport error (no response).
    pub fn has_transport_error(&self) -> bool {
        self.cases.iter().any(|c| c.transport_error.is_some())
    }

    /// True when at least one assertion failed on any case.
    pub fn has_assertion_failure(&self) -> bool {
        self.cases
            .iter()
            .flat_map(|c| &c.assertions)
            .any(|a| a.status == AssertStatus::Fail)
    }
}

fn summarize_cases(cases: &[RunCase], duration_ms: f64) -> RunSummary {
    let mut cases_failed = 0;
    let mut assertions_total = 0;
    let mut assertions_passed = 0;
    let mut assertions_failed = 0;
    let mut assertions_skipped = 0;

    for case in cases {
        if case.is_failing() {
            cases_failed += 1;
        }
        for outcome in &case.assertions {
            assertions_total += 1;
            match outcome.status {
                AssertStatus::Pass => assertions_passed += 1,
                AssertStatus::Fail => assertions_failed += 1,
                AssertStatus::Skipped => assertions_skipped += 1,
            }
        }
    }

    RunSummary {
        cases: cases.len(),
        cases_failed,
        assertions_total,
        assertions_passed,
        assertions_failed,
        assertions_skipped,
        all_green: cases_failed == 0,
        duration_ms,
    }
}

// ---------- escaping helpers ----------

/// XML/HTML attribute+text escaping for the five predefined entities.
fn escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

// ---------- JUnit XML reporter ----------

/// Render the report as JUnit XML — one `<testcase>` per assertion, a
/// `<failure>` child on failure, `<skipped/>` on skip, and one `<error>` case
/// for a request that never got a response (transport error).
pub fn junit_report(report: &RunReport) -> String {
    let s = &report.summary;
    let time = s.duration_ms / 1000.0;

    // Count JUnit-level testcases: one per assertion + one per transport error.
    let tests = s.assertions_total
        + report
            .cases
            .iter()
            .filter(|c| c.transport_error.is_some())
            .count();
    let failures = s.assertions_failed;
    let errors = report
        .cases
        .iter()
        .filter(|c| c.transport_error.is_some())
        .count();

    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str(&format!(
        "<testsuites tests=\"{tests}\" failures=\"{failures}\" errors=\"{errors}\" skipped=\"{}\" time=\"{time:.3}\">\n",
        s.assertions_skipped
    ));
    xml.push_str(&format!(
        "  <testsuite name=\"{}\" tests=\"{tests}\" failures=\"{failures}\" errors=\"{errors}\" skipped=\"{}\" time=\"{time:.3}\">\n",
        escape(&report.target.display()),
        s.assertions_skipped
    ));

    for case in &report.cases {
        let case_time = case.total_ms / 1000.0;
        let classname = escape(&case.name);

        if let Some(err) = &case.transport_error {
            xml.push_str(&format!(
                "    <testcase classname=\"{classname}\" name=\"{}\" time=\"{case_time:.3}\">\n",
                escape(&format!("{} {}", case.method, case.url))
            ));
            xml.push_str(&format!("      <error message=\"{}\"/>\n", escape(err)));
            xml.push_str("    </testcase>\n");
            continue;
        }

        for outcome in &case.assertions {
            xml.push_str(&format!(
                "    <testcase classname=\"{classname}\" name=\"{}\" time=\"{case_time:.3}\"",
                escape(&outcome.label)
            ));
            match outcome.status {
                AssertStatus::Pass => xml.push_str("/>\n"),
                AssertStatus::Skipped => {
                    xml.push_str(">\n      <skipped/>\n    </testcase>\n");
                }
                AssertStatus::Fail => {
                    xml.push_str(&format!(
                        ">\n      <failure message=\"{}\"/>\n    </testcase>\n",
                        escape(&outcome.message)
                    ));
                }
            }
        }
    }

    xml.push_str("  </testsuite>\n");
    xml.push_str("</testsuites>\n");
    xml
}

// ---------- JSON reporter ----------

/// Render the report as pretty JSON — machine-readable, stable field names,
/// round-trips back to a `RunReport` (`serde_json::from_str`).
pub fn json_report(report: &RunReport) -> String {
    serde_json::to_string_pretty(report).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
}

// ---------- HTML reporter ----------

/// Render a single self-contained HTML page (inline CSS, no assets, no JS). A
/// human opens the CI artifact and reads it. Everything from response data is
/// HTML-escaped.
pub fn html_report(report: &RunReport) -> String {
    let s = &report.summary;
    let accent = if s.all_green { "#4f46e5" } else { "#dc2626" };
    let banner = if s.all_green { "PASS" } else { "FAIL" };

    let mut html = String::new();
    html.push_str("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n");
    html.push_str("<title>Ether lok — report</title>\n<style>\n");
    html.push_str("body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f8fafc;color:#0f172a}\n");
    html.push_str(&format!(
        ".banner{{background:{accent};color:#fff;padding:20px 28px}}\n"
    ));
    html.push_str(".banner h1{margin:0 0 4px;font-size:20px}\n");
    html.push_str(".wrap{padding:20px 28px}\n");
    html.push_str("table{border-collapse:collapse;width:100%;background:#fff;margin-bottom:20px;box-shadow:0 1px 2px rgba(0,0,0,.06)}\n");
    html.push_str(
        "th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px}\n",
    );
    html.push_str(".pass{color:#4f46e5}.fail{color:#dc2626}.skip{color:#94a3b8}\n");
    html.push_str("</style></head><body>\n");

    html.push_str(&format!(
        "<div class=\"banner\"><h1>Ether · lok — {banner}</h1><div>{} · {} cases, {} assertions ({} passed, {} failed, {} skipped) · {:.0}ms</div></div>\n",
        escape(&report.target.display()),
        s.cases,
        s.assertions_total,
        s.assertions_passed,
        s.assertions_failed,
        s.assertions_skipped,
        s.duration_ms
    ));

    html.push_str("<div class=\"wrap\">\n");
    for case in &report.cases {
        html.push_str("<table>\n<thead><tr><th colspan=\"2\">");
        html.push_str(&format!(
            "{} — <code>{} {}</code> · status {} · {:.0}ms",
            escape(&case.name),
            escape(&case.method),
            escape(&case.url),
            case.status,
            case.total_ms
        ));
        html.push_str("</th></tr></thead>\n<tbody>\n");

        if let Some(err) = &case.transport_error {
            html.push_str(&format!(
                "<tr><td class=\"fail\">✖ transport</td><td>{}</td></tr>\n",
                escape(err)
            ));
        }
        for outcome in &case.assertions {
            let (mark, class) = match outcome.status {
                AssertStatus::Pass => ("✔", "pass"),
                AssertStatus::Fail => ("✖", "fail"),
                AssertStatus::Skipped => ("–", "skip"),
            };
            html.push_str(&format!(
                "<tr><td class=\"{class}\">{mark} {}</td><td>{}</td></tr>\n",
                escape(&outcome.label),
                escape(&outcome.message)
            ));
        }
        html.push_str("</tbody>\n</table>\n");
    }
    html.push_str("</div>\n</body></html>\n");
    html
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(status: AssertStatus, label: &str, message: &str) -> AssertOutcome {
        AssertOutcome {
            index: 0,
            status,
            label: label.into(),
            message: message.into(),
            expected: None,
            actual: None,
        }
    }

    fn sample_report() -> RunReport {
        let cases = vec![
            RunCase {
                request_id: "r1".into(),
                name: "GET health".into(),
                method: "GET".into(),
                url: "http://x/health".into(),
                status: 200,
                total_ms: 12.0,
                transport_error: None,
                assertions: vec![
                    outcome(AssertStatus::Pass, "status == 200", "status 200 == 200"),
                    outcome(AssertStatus::Skipped, "body contains x", "disabled"),
                ],
            },
            RunCase {
                request_id: "r2".into(),
                name: "a<b&c".into(),
                method: "GET".into(),
                url: "http://x/users".into(),
                status: 500,
                total_ms: 30.0,
                transport_error: None,
                assertions: vec![outcome(
                    AssertStatus::Fail,
                    "status == 200",
                    "expected 200, got 500",
                )],
            },
        ];
        RunReport::new(
            RunTarget::Collection("smoke".into()),
            "2026-07-13T00:00:00Z".into(),
            cases,
            42.0,
        )
    }

    #[test]
    fn junit_counts_and_escaping() {
        let xml = junit_report(&sample_report());
        // 3 assertion testcases, 1 failure, 1 skip.
        assert!(xml.contains("tests=\"3\""), "xml: {xml}");
        assert!(xml.contains("failures=\"1\""));
        assert!(xml.contains("skipped=\"1\""));
        assert!(xml.contains("<failure message="));
        assert!(xml.contains("<skipped/>"));
        // The `a<b&c` name is escaped in the classname.
        assert!(xml.contains("a&lt;b&amp;c"), "xml: {xml}");
        assert!(!xml.contains("a<b&c"));
    }

    #[test]
    fn junit_transport_error_emits_error_case() {
        let cases = vec![RunCase {
            request_id: "r".into(),
            name: "down".into(),
            method: "GET".into(),
            url: "http://127.0.0.1:1/".into(),
            status: 0,
            total_ms: 0.0,
            transport_error: Some("connection refused".into()),
            assertions: vec![],
        }];
        let report = RunReport::new(RunTarget::Request("r".into()), "t".into(), cases, 1.0);
        let xml = junit_report(&report);
        assert!(xml.contains("errors=\"1\""));
        assert!(xml.contains("<error message=\"connection refused\"/>"));
    }

    #[test]
    fn json_round_trips() {
        let report = sample_report();
        let json = json_report(&report);
        let back: RunReport = serde_json::from_str(&json).expect("round-trip");
        assert_eq!(back, report);
    }

    #[test]
    fn html_contains_names_summary_and_escapes_scripts() {
        let mut report = sample_report();
        // A response-derived message containing a script tag must be escaped.
        report.cases[0].assertions.push(outcome(
            AssertStatus::Fail,
            "body contains",
            "<script>alert(1)</script>",
        ));
        // Recompute summary after mutating cases so counts stay honest.
        let report = RunReport::new(report.target, report.started_at, report.cases, 42.0);

        let html = html_report(&report);
        assert!(html.contains("GET health"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(!html.contains("<script>alert(1)</script>"));
        // Summary banner shows the target.
        assert!(html.contains("collection: smoke"));
    }
}
