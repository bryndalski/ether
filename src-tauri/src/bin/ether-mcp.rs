//! `ether-mcp` — MCP stdio server exposing Ether's collections, environments
//! and the libcurl engine to AI agents. Register with e.g.:
//!
//!   claude mcp add ether -- ether-mcp
//!
//! All behaviour lives in `lokowka_lib::mcp`; this bin resolves the DB path
//! (same precedence as `lok`), initialises the store, and serves stdio.

use std::path::PathBuf;

use lokowka_lib::{mcp, store};

fn resolve_db_path() -> Result<PathBuf, String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--db" {
            let value = args.next().ok_or("--db requires a path")?;
            return Ok(PathBuf::from(value));
        }
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

fn main() {
    let db = match resolve_db_path() {
        Ok(path) => path,
        Err(err) => {
            eprintln!("ether-mcp: {err}");
            std::process::exit(2);
        }
    };
    if let Err(err) = store::init_path(&db) {
        eprintln!("ether-mcp: cannot open {}: {err}", db.display());
        std::process::exit(2);
    }
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    mcp::serve(stdin.lock(), stdout.lock());
}
