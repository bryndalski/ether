//! Integration tests for the `lok` runner core. This is a separate test binary,
//! so it gets a fresh process and a fresh `store::CONNECTION` `OnceLock` — it
//! never races the in-memory `store::tests` that wipe every table in `setup()`.
//!
//! Tests are offline: they bind a loopback `std::net::TcpListener` and hit
//! `127.0.0.1` — no mock transport, the engine really speaks HTTP to a local
//! one-shot server (the exact pattern in `resolve.rs`/`workflow.rs` tests).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::JoinHandle;

use lokowka_lib::cli::{self, ResolvedTarget};
use lokowka_lib::models::{
    Assertion, Auth, Body, Environment, KeyValue, RequestOptions, StoredRequest,
};
use lokowka_lib::store;

/// Serve exactly one HTTP request on a loopback port, replying with the given
/// status + JSON body, then return the raw request text the server saw.
fn serve_once(status_line: &'static str, body: &'static str) -> (String, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let host = format!("{}:{}", addr.ip(), addr.port());
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap();
        let request_text = String::from_utf8_lossy(&buf[..n]).to_string();
        let response = format!(
            "HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.flush().unwrap();
        request_text
    });
    (host, handle)
}

fn stored_request(id: &str, url: &str, assertions: Vec<Assertion>) -> StoredRequest {
    StoredRequest {
        id: id.into(),
        collection_id: "c1".into(),
        name: format!("req {id}"),
        method: "GET".into(),
        url: url.into(),
        headers: vec![],
        query_params: vec![],
        body: Body::None,
        auth: Auth::None,
        options: RequestOptions::default(),
        sort_order: 0,
        docs_md: None,
        graphql: None,
        assertions,
    }
}

/// Init the process-global store once against a unique temp-file DB. The whole
/// integration binary shares one connection (a `OnceLock`), which is fine: every
/// test uses distinct ids and reads the same DB.
fn init_store_once() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let dir = std::env::temp_dir().join(format!("lok-e2e-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let db = dir.join("ether.db");
        let _ = std::fs::remove_file(&db);
        store::init_path(&db).expect("init_path");
    });
}

#[test]
fn run_passing_request_exits_zero() {
    init_store_once();
    let (host, server) = serve_once("200 OK", r#"{"ok":true}"#);

    let request = stored_request(
        "e2e-pass",
        &format!("http://{host}/health"),
        vec![
            Assertion::StatusEquals {
                expected: 200,
                enabled: true,
            },
            Assertion::JsonPathEquals {
                path: "$.ok".into(),
                expected: "true".into(),
                enabled: true,
            },
        ],
    );

    let report = cli::run_target(ResolvedTarget::Request(Box::new(request)), None);
    server.join().unwrap();

    assert!(report.summary.all_green, "report: {report:?}");
    assert_eq!(cli::exit_code_for(&report), cli::EXIT_OK);
}

#[test]
fn run_failing_assertion_exits_one() {
    init_store_once();
    // Server replies 500 while the request asserts == 200.
    let (host, server) = serve_once("500 Internal Server Error", r#"{"ok":false}"#);

    let request = stored_request(
        "e2e-fail",
        &format!("http://{host}/boom"),
        vec![Assertion::StatusEquals {
            expected: 200,
            enabled: true,
        }],
    );

    let report = cli::run_target(ResolvedTarget::Request(Box::new(request)), None);
    server.join().unwrap();

    assert!(!report.summary.all_green);
    assert_eq!(cli::exit_code_for(&report), cli::EXIT_ASSERTION_FAILED);
    assert_ne!(cli::exit_code_for(&report), cli::EXIT_OK);
}

#[test]
fn env_host_is_interpolated_through_cli_path() {
    init_store_once();
    let (host, server) = serve_once("200 OK", r#"{"ok":true}"#);

    // Persist an environment whose `host` var points at the loopback server,
    // then run a request that interpolates {{env.host}} into the URL.
    let env = Environment {
        id: String::new(),
        name: "e2e-live".into(),
        parent_id: None,
        color: None,
        variables: vec![KeyValue {
            name: "host".into(),
            value: host.clone(),
            enabled: true,
        }],
        secret_names: vec![],
    };
    store::upsert_environment(env).unwrap();
    let saved = store::list_environments()
        .unwrap()
        .into_iter()
        .find(|e| e.name == "e2e-live")
        .unwrap();

    // Resolve the env by NAME, exactly like the CLI does.
    let env_id = cli::resolve_env_id(Some("e2e-live")).unwrap();
    assert_eq!(env_id.as_deref(), Some(saved.id.as_str()));

    let request = stored_request(
        "e2e-env",
        "http://{{env.host}}/health",
        vec![Assertion::StatusEquals {
            expected: 200,
            enabled: true,
        }],
    );

    let report = cli::run_target(ResolvedTarget::Request(Box::new(request)), env_id.as_deref());
    let request_text = server.join().unwrap();

    assert!(report.summary.all_green, "report: {report:?}");
    assert!(
        request_text.starts_with("GET /health "),
        "loopback saw: {}",
        request_text.lines().next().unwrap_or("")
    );
}

#[test]
fn transport_error_exits_three() {
    init_store_once();
    // Bind a port then drop the listener so nothing is listening — connection
    // is refused. No assertions: a pure connectivity failure ⇒ exit class 3.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener);

    let request = stored_request("e2e-down", &format!("http://{addr}/x"), vec![]);
    let report = cli::run_target(ResolvedTarget::Request(Box::new(request)), None);

    assert!(report.has_transport_error());
    assert_eq!(cli::exit_code_for(&report), cli::EXIT_TRANSPORT);
}

#[test]
fn list_and_collection_run_through_seeded_db() {
    init_store_once();

    use lokowka_lib::models::Collection;
    store::upsert_collection(Collection {
        id: "e2e-coll".into(),
        name: "e2e smoke".into(),
        parent_id: None,
        sort_order: 0,
        docs_md: None,
    })
    .unwrap();

    let (host, server) = serve_once("200 OK", r#"{"ok":true}"#);
    let mut request = stored_request(
        "e2e-coll-req",
        &format!("http://{host}/one"),
        vec![Assertion::StatusEquals {
            expected: 200,
            enabled: true,
        }],
    );
    request.collection_id = "e2e-coll".into();
    store::upsert_request(request).unwrap();

    // `list requests` sees the seeded request.
    let requests = store::list_requests(None).unwrap();
    assert!(requests.iter().any(|r| r.id == "e2e-coll-req"));

    // Collections listing sees the seeded collection.
    let collections = store::list_collections().unwrap();
    assert!(collections.iter().any(|c| c.id == "e2e-coll"));

    // resolve_target on the collection id runs every request in it.
    let resolved = cli::resolve_target("e2e-coll").unwrap();
    let report = cli::run_target(resolved, None);
    server.join().unwrap();

    assert_eq!(report.summary.cases, 1);
    assert!(report.summary.all_green, "report: {report:?}");
}

#[test]
fn unknown_target_is_a_usage_error() {
    init_store_once();
    let err = cli::resolve_target("does-not-exist-uuid").unwrap_err();
    assert!(err.contains("unknown target id"), "got: {err}");
}

#[test]
fn file_request_runs_without_the_store() {
    // The --file path must NOT touch the DB: run a request against a loopback
    // server with no store init on this code path (init_store_once is harmless
    // but run_file_request resolves against an empty context, never the store).
    let (host, server) = serve_once("200 OK", r#"{"ok":true}"#);
    let request = stored_request(
        "file-req",
        &format!("http://{host}/from-file"),
        vec![Assertion::StatusEquals {
            expected: 200,
            enabled: true,
        }],
    );

    let report = cli::run_file_request(&request, "exported.json");
    let request_text = server.join().unwrap();

    assert!(report.summary.all_green, "report: {report:?}");
    assert_eq!(cli::exit_code_for(&report), cli::EXIT_OK);
    assert!(request_text.starts_with("GET /from-file "));
}
