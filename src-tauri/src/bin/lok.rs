//! `lok` — Ether's headless API-test runner.
//!
//! Runs saved requests / collections against real endpoints from a terminal or
//! a CI job — no GUI, no Tauri window, no mocks — evaluates the same scriptless
//! assertions the desktop app shows, and exits non-zero when any fails, so an
//! API contract becomes a `cargo build && lok run …` gate.
//!
//! This bin is a thin adapter: parse argv → drive `lokowka_lib::cli` → format
//! with `lokowka_lib::report` → map the aggregate `RunReport` to an exit code.
//! All behaviour lives in the library (and is unit/integration tested there);
//! `main` only wires it together.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Args, Parser, Subcommand, ValueEnum};

use lokowka_lib::cli::{self, ResolvedTarget};
use lokowka_lib::models::StoredRequest;
use lokowka_lib::report::{self, RunReport};
use lokowka_lib::store;

#[derive(Parser)]
#[command(name = "lok", about = "Ether headless API runner", version)]
struct Cli {
    /// Path to ether.db (default: $ETHER_DATA_DIR/ether.db or the app-support DB).
    #[arg(long, global = true)]
    db: Option<PathBuf>,

    /// Suppress the human summary (a reporter file is still written).
    #[arg(short, long, global = true)]
    quiet: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run a request / collection (id or exported --file) and gate on assertions.
    Run(RunArgs),
    /// List saved requests, collections, or workflows.
    List(ListArgs),
}

#[derive(Args)]
struct RunArgs {
    /// A request id or collection id (auto-detected). Omit when using --file.
    target: Option<String>,

    /// Run an exported request JSON instead of the DB (no DB init).
    #[arg(long)]
    file: Option<PathBuf>,

    /// Environment by NAME (resolved to its id via the store).
    #[arg(long)]
    env: Option<String>,

    /// Report format written to --out (or stdout).
    #[arg(long, value_enum)]
    reporter: Option<Reporter>,

    /// Write the report here (default: stdout for the chosen format).
    #[arg(long)]
    out: Option<PathBuf>,
}

#[derive(Args)]
struct ListArgs {
    #[arg(value_enum)]
    what: ListWhat,

    /// Emit the listing as JSON for scripting.
    #[arg(long, value_enum)]
    reporter: Option<Reporter>,
}

#[derive(Copy, Clone, ValueEnum)]
enum Reporter {
    Junit,
    Json,
    Html,
}

#[derive(Copy, Clone, ValueEnum)]
enum ListWhat {
    Requests,
    Collections,
    Workflows,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => ExitCode::from(code as u8),
        Err(err) => {
            eprintln!("lok: {err}");
            ExitCode::from(cli::EXIT_USAGE as u8)
        }
    }
}

/// The whole CLI body, returning an exit code (or a usage error string that
/// `main` prints and turns into exit 2).
fn run(cli: Cli) -> Result<i32, String> {
    match cli.command {
        Command::Run(args) => run_command(cli.db, cli.quiet, args),
        Command::List(args) => list_command(cli.db, args),
    }
}

/// Resolve the DB path (highest precedence first): `--db`, then
/// `$ETHER_DATA_DIR`/`$LOKOWKA_DATA_DIR`, then the desktop app-support location.
fn resolve_db_path(db_flag: Option<PathBuf>) -> Result<PathBuf, String> {
    if let Some(path) = db_flag {
        return Ok(path);
    }
    if let Some(dir) =
        std::env::var_os("ETHER_DATA_DIR").or_else(|| std::env::var_os("LOKOWKA_DATA_DIR"))
    {
        return Ok(PathBuf::from(dir).join("ether.db"));
    }
    let home = dirs::home_dir().ok_or("cannot resolve home directory")?;
    Ok(home
        .join("Library")
        .join("Application Support")
        .join("com.bryndalski.ether")
        .join("ether.db"))
}

fn run_command(db_flag: Option<PathBuf>, quiet: bool, args: RunArgs) -> Result<i32, String> {
    // --file runs without a DB; the id path needs the store initialised first.
    if let Some(file) = &args.file {
        // `--env` needs the store to resolve a name → id; --file is DB-free, so
        // a named env here is a usage error (bundle env values inline instead).
        if let Some(name) = args.env.as_deref() {
            return Err(format!(
                "--env {name} needs the DB; --file runs without one (bundle env values inline)"
            ));
        }
        let request = load_request_file(file)?;
        let report = cli::run_file_request(&request, &file.display().to_string());
        return finish(&report, quiet, args.reporter, args.out.as_deref());
    }

    let target_id = args
        .target
        .as_deref()
        .ok_or("a target id (or --file) is required for `run`")?;

    let db_path = resolve_db_path(db_flag)?;
    store::init_path(&db_path)?;

    let env_id = cli::resolve_env_id(args.env.as_deref())?;
    let resolved: ResolvedTarget = cli::resolve_target(target_id)?;
    let report = cli::run_target(resolved, env_id.as_deref());
    finish(&report, quiet, args.reporter, args.out.as_deref())
}

fn load_request_file(path: &std::path::Path) -> Result<StoredRequest, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    serde_json::from_str::<StoredRequest>(&raw)
        .map_err(|e| format!("parse {} as a request: {e}", path.display()))
}

/// Write/print the report per `--reporter`/`--out`, print the human summary
/// unless `--quiet`, and return the exit code derived from the aggregate.
fn finish(
    report: &RunReport,
    quiet: bool,
    reporter: Option<Reporter>,
    out: Option<&std::path::Path>,
) -> Result<i32, String> {
    if let Some(fmt) = reporter {
        let formatted = match fmt {
            Reporter::Junit => report::junit_report(report),
            Reporter::Json => report::json_report(report),
            Reporter::Html => report::html_report(report),
        };
        match out {
            Some(path) => {
                std::fs::write(path, &formatted)
                    .map_err(|e| format!("write {}: {e}", path.display()))?;
            }
            None => println!("{formatted}"),
        }
    }

    if !quiet && (out.is_some() || reporter.is_none()) {
        print_summary(report);
    }

    Ok(cli::exit_code_for(report))
}

fn print_summary(report: &RunReport) {
    let s = &report.summary;
    let verdict = if s.all_green { "PASS" } else { "FAIL" };
    println!(
        "{verdict}  {} cases · {} assertions ({} passed, {} failed, {} skipped) · {:.0}ms",
        s.cases,
        s.assertions_total,
        s.assertions_passed,
        s.assertions_failed,
        s.assertions_skipped,
        s.duration_ms
    );
    for case in &report.cases {
        if let Some(err) = &case.transport_error {
            println!("  ✖ {} — transport error: {err}", case.name);
            continue;
        }
        for outcome in &case.assertions {
            let mark = match outcome.status {
                lokowka_lib::assert::AssertStatus::Pass => "✔",
                lokowka_lib::assert::AssertStatus::Fail => "✖",
                lokowka_lib::assert::AssertStatus::Skipped => "–",
            };
            println!("  {mark} {} · {}", case.name, outcome.message);
        }
    }
}

fn list_command(db_flag: Option<PathBuf>, args: ListArgs) -> Result<i32, String> {
    let db_path = resolve_db_path(db_flag)?;
    store::init_path(&db_path)?;

    let as_json = matches!(args.reporter, Some(Reporter::Json));
    match args.what {
        ListWhat::Requests => {
            let requests = store::list_requests(None)?;
            if as_json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&requests).map_err(|e| e.to_string())?
                );
            } else {
                for r in &requests {
                    println!("{}  {:<6} {}", r.id, r.method, r.name);
                }
            }
        }
        ListWhat::Collections => {
            let collections = store::list_collections()?;
            if as_json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&collections).map_err(|e| e.to_string())?
                );
            } else {
                for c in &collections {
                    println!("{}  {}", c.id, c.name);
                }
            }
        }
        ListWhat::Workflows => {
            let workflows = store::workflow_list()?;
            if as_json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&workflows).map_err(|e| e.to_string())?
                );
            } else {
                for w in &workflows {
                    println!("{}  {}  ({} nodes)", w.id, w.name, w.nodes.len());
                }
            }
        }
    }
    Ok(cli::EXIT_OK)
}
