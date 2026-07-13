# Ether

**A fully local API client for macOS with curl under the hood — literally.**

Postman ∪ Insomnia, minus the cloud: no account, no sync, no telemetry. Your collections live in a local SQLite database, your secrets live in the macOS Keychain, and every request you send is executed by libcurl — so "Copy as curl" is not an approximation, it *is* the request.

> _Ether_ — requests into the void: they leave, they return, and **nothing escapes your machine**.

## Why

| Pain | Ether |
|---|---|
| Postman forces an account for collections & environments | 100% local, zero account |
| Insomnia's 2023 cloud migration drama | One storage mode: your disk |
| Every client fakes "Copy as curl" (Bruno=Axios, Yaak=reqwest) | Engine **is** libcurl — copy is 1:1 |
| Electron bloat (200+ MB RAM, slow start) | Tauri v2 + WKWebView, native-light |
| Stale GraphQL schemas, no introspection UX | Auto-introspection + checkbox query builder + visible "Refresh schema" |

## Core features (v1 roadmap)

- **HTTP engine on libcurl**: per-phase timings (DNS/connect/TLS/TTFB/download), cookie jar per environment, redirect control with cross-host `Authorization` strip, mTLS, custom CA, `--insecure` with explicit warning
- **Environments**: base + sub-environments with inheritance, one-click switching, public/private split (public file is commit-safe; secret values live in Keychain)
- **Interpolation** `{{env.x}} / {{secret.x}} / {{$uuid}} / {{$timestamp}} / …` everywhere — URL, params, headers, body, auth, and inside GraphQL queries; closed non-Turing engine with context-aware escaping (no template-injection CVEs here)
- **Interactive GraphQL explorer**: pick operation type → point at endpoint → schema introspected automatically (with your auth headers) → checkbox field tree ⇄ editor two-way sync, autocomplete, docs explorer, SDL fallback
- **Two-way curl round-trip**: edit the request *as a curl command* and watch the GUI update, and vice versa
- **Timeline**: `curl -v`-style log + waterfall, secrets redacted
- **Import**: curl commands, your `~/.zsh_history`, Postman v2.1, Insomnia, HAR (with review screen), `.http` files (JetBrains/VS Code interop)
- **Testing**: scriptless assertions, QuickJS sandboxed scripts, snapshot testing with dynamic-field scrubbing, watch mode
- **Analysis**: response diff (structural + timing), mini-benchmark with p50/p95/p99 histograms, JWT decoder with live expiry countdown, TLS chain viewer
- **macOS native**: ⌘K command palette, global hotkey, `ether://` deep links, menu bar, Touch ID for secrets
- **CLI `lok`**: headless runner with JUnit/JSON/HTML reporters — same libcurl core as the GUI
- **Optional local AI** (OFF by default): Ollama on localhost, ⌘K commands that materialize artifacts, secrets always redacted from prompts

See [docs/specs/2026-07-12-lokowka-design.md](docs/specs/2026-07-12-lokowka-design.md) for the full design and [docs/research/](docs/research/) for the market research behind it.

## Development

Prerequisites: Rust (stable), Node 22+, Xcode CLT.

```sh
npm install
npm run tauri dev     # run the app
npm run typecheck     # tsc --noEmit
npm run test:unit     # vitest
cd src-tauri && cargo test && cargo clippy
```

> **Rebrand note (Lokówka → Ether).** The rebrand relocates the macOS Keychain
> service and the on-disk data directory to `com.bryndalski.ether`. Existing
> local Lokówka data will **not** appear in Ether — re-create your dev data, or
> move the folder manually once:
> `mv ~/Library/Application\ Support/com.bryndalski.lokowka ~/Library/Application\ Support/com.bryndalski.ether`.
> The interface is English by default; switch to Polish from the ⌘K palette
> (`Language: Polski`).

## Principles

1. **Local first, local only.** No feature may require network access except the requests you send.
2. **Request 1:1 = curl.** If the app can't express it as a curl command, think twice.
3. **Secrets never touch disk in plaintext** — not in SQLite, not in exports, not in the clipboard, not in AI prompts.
4. **Simple beats complete.** One window, one storage mode, ⌘K for everything.

## License

MIT
