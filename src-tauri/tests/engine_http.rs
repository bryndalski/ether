//! Offline integration tests for the libcurl engine. A tiny blocking HTTP
//! server on 127.0.0.1 (std::net only, no internet) serves scripted responses
//! so every behaviour — timings, redirects, cookie jars, cancellation, body
//! truncation, verbose redaction — is exercised end to end.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use lokowka_lib::engine;
use lokowka_lib::models::{
    ApiKeyPlacement, Auth, Body, KeyValue, MultipartPart, RequestOptions, RequestSpec,
};

/// One parsed HTTP request off the socket.
struct Incoming {
    method: String,
    /// Retained for assertions that inspect the target path per hop.
    #[allow(dead_code)]
    path: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Option<Incoming> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).ok()? == 0 {
        return None;
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut headers = Vec::new();
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            break;
        }
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            let name = name.trim().to_string();
            let value = value.trim().to_string();
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.parse().unwrap_or(0);
            }
            headers.push((name, value));
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).ok()?;
    }
    Some(Incoming {
        method,
        path,
        headers,
        body,
    })
}

fn header_value<'a>(req: &'a Incoming, name: &str) -> Option<&'a str> {
    req.headers
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

fn write_response(
    stream: &mut TcpStream,
    status_line: &str,
    headers: &[(&str, String)],
    body: &[u8],
) {
    let mut out = format!("HTTP/1.1 {status_line}\r\n");
    for (name, value) in headers {
        out.push_str(&format!("{name}: {value}\r\n"));
    }
    out.push_str(&format!("Content-Length: {}\r\n", body.len()));
    out.push_str("Connection: close\r\n\r\n");
    let _ = stream.write_all(out.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

/// Spawn a one-shot server that runs `handler` for each accepted connection,
/// then stops after `connections` connections. Returns the bound base URL.
fn serve<F>(connections: usize, handler: F) -> String
where
    F: Fn(Incoming, &mut TcpStream) + Send + Sync + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("addr");
    let handler = Arc::new(handler);
    thread::spawn(move || {
        for _ in 0..connections {
            let (mut stream, _) = match listener.accept() {
                Ok(pair) => pair,
                Err(_) => break,
            };
            if let Some(req) = read_request(&mut stream) {
                (handler)(req, &mut stream);
            }
        }
    });
    format!("http://{addr}")
}

fn spec(id: &str, method: &str, url: &str) -> RequestSpec {
    RequestSpec {
        id: id.to_string(),
        method: method.to_string(),
        url: url.to_string(),
        headers: Vec::new(),
        query_params: Vec::new(),
        body: Body::None,
        auth: Auth::None,
        options: RequestOptions::default(),
    }
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

#[test]
fn get_200_returns_headers_and_timings() {
    let base = serve(1, |_req, stream| {
        write_response(
            stream,
            "200 OK",
            &[
                ("X-Custom", "hello".into()),
                ("Content-Type", "text/plain".into()),
            ],
            b"pong",
        );
    });
    let response = block_on(engine::execute_request(spec(
        "t1",
        "GET",
        &format!("{base}/ping"),
    )))
    .expect("request ok");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, "pong");
    assert!(response.http_version.starts_with("HTTP/"));
    assert!(response
        .headers
        .iter()
        .any(|h| h.name.eq_ignore_ascii_case("x-custom") && h.value == "hello"));
    assert!(response.timings.total_ms >= 0.0);
    assert_eq!(response.size_download_bytes, 4);
    assert!(response.redirect_chain.is_empty());
}

#[test]
fn post_json_body_is_echoed() {
    let base = serve(1, |req, stream| {
        assert_eq!(req.method, "POST");
        assert_eq!(header_value(&req, "content-type"), Some("application/json"));
        write_response(
            stream,
            "200 OK",
            &[("Content-Type", "application/json".into())],
            &req.body,
        );
    });
    let mut request = spec("t2", "POST", &format!("{base}/echo"));
    request.body = Body::Raw {
        content_type: "application/json".into(),
        text: r#"{"a":1}"#.into(),
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");
    assert_eq!(response.status, 200);
    assert_eq!(response.body, r#"{"a":1}"#);
}

#[test]
fn redirect_same_host_keeps_authorization() {
    let seen = Arc::new(AtomicU64::new(0));
    let seen_srv = Arc::clone(&seen);
    let got_auth = Arc::new(AtomicU64::new(0));
    let got_auth_srv = Arc::clone(&got_auth);

    let base = serve(2, move |req, stream| {
        let n = seen_srv.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            write_response(stream, "302 Found", &[("Location", "/final".into())], b"");
        } else {
            if header_value(&req, "authorization").is_some() {
                got_auth_srv.fetch_add(1, Ordering::SeqCst);
            }
            write_response(stream, "200 OK", &[], b"done");
        }
    });

    let mut request = spec("t3", "GET", &format!("{base}/start"));
    request.auth = Auth::Bearer {
        token: "sekret".into(),
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");

    assert_eq!(response.status, 200);
    assert_eq!(response.redirect_chain.len(), 1);
    assert!(!response.redirect_chain[0].auth_stripped);
    assert_eq!(
        got_auth.load(Ordering::SeqCst),
        1,
        "auth must reach same-host target"
    );
}

#[test]
fn redirect_cross_host_strips_authorization() {
    // Second host records whether it received Authorization.
    let leaked = Arc::new(AtomicU64::new(0));
    let leaked_srv = Arc::clone(&leaked);
    let host_b = serve(1, move |req, stream| {
        if header_value(&req, "authorization").is_some() {
            leaked_srv.fetch_add(1, Ordering::SeqCst);
        }
        write_response(stream, "200 OK", &[], b"cross");
    });
    let host_b_url = host_b.clone();

    let host_a = serve(1, move |_req, stream| {
        write_response(
            stream,
            "302 Found",
            &[("Location", format!("{host_b_url}/x"))],
            b"",
        );
    });

    let mut request = spec("t4", "GET", &format!("{host_a}/start"));
    request.auth = Auth::Bearer {
        token: "sekret".into(),
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");

    assert_eq!(response.status, 200);
    assert_eq!(response.body, "cross");
    assert_eq!(response.redirect_chain.len(), 1);
    assert!(
        response.redirect_chain[0].auth_stripped,
        "cross-host hop must flag auth_stripped"
    );
    assert_eq!(
        leaked.load(Ordering::SeqCst),
        0,
        "Authorization must not cross hosts"
    );
}

#[test]
fn redirect_303_changes_post_to_get() {
    let method_at_target = Arc::new(std::sync::Mutex::new(String::new()));
    let recorder = Arc::clone(&method_at_target);
    let hops = Arc::new(AtomicU64::new(0));
    let hops_srv = Arc::clone(&hops);

    let base = serve(2, move |req, stream| {
        let n = hops_srv.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            write_response(
                stream,
                "303 See Other",
                &[("Location", "/result".into())],
                b"",
            );
        } else {
            *recorder.lock().unwrap() = req.method.clone();
            write_response(stream, "200 OK", &[], b"ok");
        }
    });

    let mut request = spec("t5", "POST", &format!("{base}/submit"));
    request.body = Body::Raw {
        content_type: "text/plain".into(),
        text: "payload".into(),
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");

    assert_eq!(response.status, 200);
    assert_eq!(*method_at_target.lock().unwrap(), "GET");
}

/// A per-test temp data dir wired through LOKOWKA_DATA_DIR so cookie jars never
/// touch the real Application Support tree. Removed on drop. The env var is
/// process-global, so jar tests must not run concurrently against different
/// dirs — the shared `JAR_ENV_LOCK` serialises them.
struct TempDataDir {
    path: std::path::PathBuf,
    _guard: std::sync::MutexGuard<'static, ()>,
}

fn jar_env_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

impl TempDataDir {
    fn new(tag: &str) -> Self {
        let guard = jar_env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let path = std::env::temp_dir().join(format!(
            "lokowka-test-{}-{}-{}",
            tag,
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&path).expect("create temp data dir");
        std::env::set_var("LOKOWKA_DATA_DIR", &path);
        Self {
            path,
            _guard: guard,
        }
    }

    fn jar_file(&self, key: &str) -> std::path::PathBuf {
        self.path.join("cookies").join(format!("{key}.txt"))
    }
}

impl Drop for TempDataDir {
    fn drop(&mut self) {
        std::env::remove_var("LOKOWKA_DATA_DIR");
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

#[test]
fn cookie_jar_persists_between_two_requests() {
    let data = TempDataDir::new("persist");
    let jar_key = "persist-jar";

    // First request: server sets a cookie.
    let base1 = serve(1, |_req, stream| {
        write_response(
            stream,
            "200 OK",
            &[("Set-Cookie", "sid=abc123; Path=/".into())],
            b"set",
        );
    });
    let mut first = spec("c1", "GET", &format!("{base1}/login"));
    first.options.cookie_jar = Some(jar_key.to_string());
    let r1 = block_on(engine::execute_request(first)).expect("first ok");
    assert_eq!(r1.status, 200);

    // Each serve() binds a fresh port and libcurl scopes cookies by host+port,
    // so a second request cannot reuse the authority here; instead assert the
    // jar file (inside the temp data dir) now contains the cookie.
    let contents = std::fs::read_to_string(data.jar_file(jar_key)).unwrap_or_default();
    assert!(
        contents.contains("sid"),
        "cookie jar must persist the cookie: {contents}"
    );
}

#[test]
fn cookie_jar_sends_stored_cookie_on_next_request() {
    let _data = TempDataDir::new("replay");
    // Bind one fixed listener and drive two sequential requests through it so
    // host:port stays constant and libcurl replays the stored cookie.
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().unwrap();
    let base = format!("http://{addr}");
    let replayed = Arc::new(AtomicU64::new(0));
    let replayed_srv = Arc::clone(&replayed);

    let handle = thread::spawn(move || {
        for i in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            let req = read_request(&mut stream).unwrap();
            if i == 0 {
                write_response(
                    &mut stream,
                    "200 OK",
                    &[("Set-Cookie", "sid=xyz; Path=/".into())],
                    b"set",
                );
            } else {
                if header_value(&req, "cookie")
                    .map(|c| c.contains("sid=xyz"))
                    .unwrap_or(false)
                {
                    replayed_srv.fetch_add(1, Ordering::SeqCst);
                }
                write_response(&mut stream, "200 OK", &[], b"ok");
            }
        }
    });

    let jar_key = "replay-jar";
    let mut first = spec("cj1", "GET", &format!("{base}/a"));
    first.options.cookie_jar = Some(jar_key.to_string());
    block_on(engine::execute_request(first)).expect("first ok");

    let mut second = spec("cj2", "GET", &format!("{base}/b"));
    second.options.cookie_jar = Some(jar_key.to_string());
    block_on(engine::execute_request(second)).expect("second ok");

    handle.join().unwrap();
    assert_eq!(
        replayed.load(Ordering::SeqCst),
        1,
        "stored cookie must be replayed"
    );
}

#[test]
fn cancellation_aborts_in_flight_request() {
    // Server accepts, sends headers, then stalls before the body so the client
    // stays mid-transfer while we cancel it.
    let base = serve(1, |_req, stream| {
        let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n");
        let _ = stream.flush();
        thread::sleep(Duration::from_secs(3));
        let _ = stream.write_all(&[b'x'; 100]);
    });

    let request_id = "cancel-me".to_string();
    let url = format!("{base}/slow");
    let canceller = request_id.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(300));
        let _ = engine::cancel_request(canceller);
    });

    let mut request = spec(&request_id, "GET", &url);
    request.options.timeout_ms = 10_000;
    let result = block_on(engine::execute_request(request));
    assert!(result.is_err(), "cancelled request must return an error");
    assert!(
        result.unwrap_err().to_lowercase().contains("cancel"),
        "error should mention cancellation"
    );
}

#[test]
fn verbose_log_redacts_secret_headers() {
    let base = serve(1, |_req, stream| {
        write_response(
            stream,
            "200 OK",
            &[("Set-Cookie", "session=topsecret; Path=/".into())],
            b"ok",
        );
    });
    let mut request = spec("v1", "GET", &format!("{base}/private"));
    request.auth = Auth::Bearer {
        token: "leakme".into(),
    };
    request.headers = vec![KeyValue {
        name: "X-Api-Key".into(),
        value: "keyleak".into(),
        enabled: true,
    }];
    let response = block_on(engine::execute_request(request)).expect("request ok");

    let log = response.verbose_log;
    assert!(log.contains("•••"), "log should contain redaction marker");
    assert!(!log.contains("leakme"), "bearer token must be redacted");
    assert!(!log.contains("keyleak"), "api key must be redacted");
    assert!(!log.contains("topsecret"), "set-cookie must be redacted");
}

#[test]
fn oversized_body_is_truncated_and_reports_full_size() {
    // Serve slightly more than the 10 MB cap.
    let over = 10 * 1024 * 1024 + 4096;
    let base = serve(1, move |_req, stream| {
        let header =
            format!("HTTP/1.1 200 OK\r\nContent-Length: {over}\r\nConnection: close\r\n\r\n");
        let _ = stream.write_all(header.as_bytes());
        let chunk = vec![b'a'; 64 * 1024];
        let mut written = 0usize;
        while written < over {
            let take = chunk.len().min(over - written);
            if stream.write_all(&chunk[..take]).is_err() {
                break;
            }
            written += take;
        }
        let _ = stream.flush();
    });

    let mut request = spec("big", "GET", &format!("{base}/big"));
    request.options.timeout_ms = 30_000;
    let response = block_on(engine::execute_request(request)).expect("request ok");

    assert_eq!(response.body_truncated_at, Some(10 * 1024 * 1024));
    assert_eq!(response.size_download_bytes, over as u64);
    assert_eq!(response.body.len(), 10 * 1024 * 1024);
}

#[test]
fn multipart_text_parts_are_sent() {
    let base = serve(1, |req, stream| {
        assert_eq!(req.method, "POST");
        let ct = header_value(&req, "content-type").unwrap_or("");
        assert!(
            ct.starts_with("multipart/form-data"),
            "expected multipart content-type, got {ct}"
        );
        // Both field names and values must appear in the wire body.
        let body = String::from_utf8_lossy(&req.body);
        assert!(body.contains("name=\"field_a\""), "missing field_a: {body}");
        assert!(body.contains("hello"), "missing value hello: {body}");
        assert!(body.contains("name=\"field_b\""), "missing field_b: {body}");
        assert!(body.contains("world"), "missing value world: {body}");
        write_response(stream, "200 OK", &[], b"ok");
    });

    let mut request = spec("mp1", "POST", &format!("{base}/upload"));
    request.body = Body::Multipart {
        parts: vec![
            MultipartPart::Text {
                name: "field_a".into(),
                value: "hello".into(),
            },
            MultipartPart::Text {
                name: "field_b".into(),
                value: "world".into(),
            },
        ],
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");
    assert_eq!(response.status, 200);
}

#[test]
fn form_urlencoded_body_is_encoded() {
    let base = serve(1, |req, stream| {
        assert_eq!(req.method, "POST");
        assert_eq!(
            header_value(&req, "content-type"),
            Some("application/x-www-form-urlencoded")
        );
        write_response(stream, "200 OK", &[], &req.body);
    });

    let mut request = spec("fu1", "POST", &format!("{base}/form"));
    request.body = Body::FormUrlencoded {
        fields: vec![
            KeyValue {
                name: "q".into(),
                value: "a b".into(),
                enabled: true,
            },
            KeyValue {
                name: "skip".into(),
                value: "x".into(),
                enabled: false,
            },
        ],
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");
    assert_eq!(response.status, 200);
    // Enabled field percent-encoded; disabled field omitted.
    assert_eq!(response.body, "q=a%20b");
}

#[test]
fn api_key_in_query_is_appended() {
    let received_query = Arc::new(std::sync::Mutex::new(String::new()));
    let recorder = Arc::clone(&received_query);
    let base = serve(1, move |req, stream| {
        *recorder.lock().unwrap() = req.path.clone();
        write_response(stream, "200 OK", &[], b"ok");
    });

    let mut request = spec("ak1", "GET", &format!("{base}/data"));
    request.auth = Auth::ApiKey {
        name: "api_key".into(),
        value: "secret value".into(),
        placement: ApiKeyPlacement::Query,
    };
    let response = block_on(engine::execute_request(request)).expect("request ok");
    assert_eq!(response.status, 200);

    let path = received_query.lock().unwrap().clone();
    // Both name and value are percent-encoded (NON_ALPHANUMERIC), so the
    // underscore in the key becomes %5F and the space in the value %20.
    assert!(
        path.contains("api%5Fkey=secret%20value"),
        "api key must be percent-encoded in the query string: {path}"
    );
    // The key must never leak into the Authorization header.
    assert!(!response.verbose_log.contains("Authorization: ApiKey"));
}

#[test]
fn binary_response_body_is_base64() {
    // Serve a body with non-UTF-8 bytes so the engine must base64-encode it.
    let base = serve(1, |_req, stream| {
        write_response(
            stream,
            "200 OK",
            &[("Content-Type", "application/octet-stream".into())],
            &[0xff, 0xfe, 0x00, 0x01, 0x80],
        );
    });

    let response = block_on(engine::execute_request(spec(
        "b64",
        "GET",
        &format!("{base}/bin"),
    )))
    .expect("request ok");

    assert_eq!(response.status, 200);
    assert!(
        response.body_is_base64,
        "binary body must be flagged base64"
    );
    // 0xff 0xfe 0x00 0x01 0x80 => base64 "//4AAYA=".
    assert_eq!(response.body, "//4AAYA=");
    assert_eq!(response.size_download_bytes, 5);
}
