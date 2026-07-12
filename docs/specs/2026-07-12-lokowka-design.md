# Lokówka — lokalny klient API na macOS, curl pod maską (dosłownie)

## Kontekst
Nowy, samodzielny projekt: w pełni lokalny klient API (Postman ∪ Insomnia) na macOS. Motywacja: 100% prywatnie (zero konta/chmury/telemetrii), lekkość, własny DX. Luka rynkowa: **żaden klient nie używa curl jako silnika** (Bruno=Axios, Yaak=reqwest, Paw=własny) — u nas „Copy as curl" = dosłownie wykonany request. Cel usera: prosta obsługa + spektakularny UX/UI + maksymalnie „dojebany" zestaw funkcji.

Nazwa: **Lokówka** (curling iron — narzędzie robiące curl; pun zamierzony). Repo: `github.com/bryndalski/lokowka` → `~/kodowanie/lokowka`. Alternatywy: Gyre, Zwój, Whorl.

Research (2 workflowy, 13 agentów): `wf_21dcfacb-443` (funkcje Postman/Insomnia/Bruno-Yaak-Paw + GQL-UX + stack) i `wf_b65b8657-dd9` (power-features + kurator). Pełne wyniki: `/private/tmp/claude-501/-Users-bryndalski-kodowanie-private/3655ac8f-0a28-4fb4-929c-3fc24229bb38/tasks/{wmsqif8ps,wrj1xaj4z}.output` → skopiować do `docs/research/` w pierwszym commicie.

## Wymagania rdzeniowe (potwierdzone)
1. macOS; **silnik HTTP = libcurl linkowany w Rust** (nie shell-out)
2. Env/secrety/kolekcje + łatwe przełączanie (dropdown + quick-look + kolory środowisk)
3. **Interaktywny eksplorator GraphQL**: typ operacji → URL → auto-introspekcja → checkboxowe drzewo pól ↔ edytor (dwukierunkowo) + Docs Explorer + „Refresh schema" + fallback SDL
4. Substytucja `{{env.x}}` wszędzie (też w treści GQL query — przewaga nad Insomnią)
5. v1 dodatkowo (wybór usera): wizualny edytor workflow, sandbox JS, subskrypcje GQL, import Postman/Insomnia/curl, historia, timeline, docs MD + **power-features z kuratora (niżej)**

## Stack
| Obszar | Decyzja |
|---|---|
| Shell | **Tauri v2** (Rust + WKWebView); React + **CodeMirror 6 + cm6-graphql**; canvas workflow: React Flow |
| HTTP | **crate `curl`** (libcurl bundlowany: HTTP/2, mTLS, cookie engine, timingi) |
| Storage | **SQLite** (kolekcje, env, historia, cache schematów, FTS5); eksport plikowy |
| Secrety | **macOS Keychain** (crate `keyring`); split env public/private; maskowanie wszędzie (UI/timeline/historia/Copy-as-curl/eksport) |
| Interpolacja | Własny zamknięty silnik `{{env.x}}/{{secret.x}}/{{$dynamic}}` — NIE Nunjucks (CVE Insomnii); kontekstowe escapowanie, nesting z detekcją cykli |
| Skrypty | **QuickJS (`rquickjs`)** — izolowany (bez fs/net/process), limity czas/pamięć |
| Subskrypcje | `graphql-ws` + `graphql-sse` |
| Lokalne AI (opcja) | Ollama localhost, structured outputs; OFF domyślnie |

## Milestony v1
**M1 — Silnik curl**: metody, body (raw/JSON/form-urlencoded/multipart+pliki); cookie jar per env (browser-like, 1:1 z `--cookie-jar`); redirecty (`-L`, max-redirs, `@no-redirect` per request, strip `Authorization` cross-host); `--compressed`; timeouty+anulowanie+retry/backoff „until-assert" (duch hurl); `--insecure` z ostrzeżeniem + custom CA; streaming dużych odpowiedzi; zapis odpowiedzi do pliku (`>>`/`>>!` z auto-suffixem, jak JetBrains); timingi per faza (DNS/connect/TLS/TTFB/download)
**M2 — Zmienne i środowiska**: silnik interpolacji; env base+sub z dziedziczeniem; **split public (commitowalne) / private (Keychain, gitignore)**; dynamic values: `{{$uuid}}/{{$timestamp}}/{{$random.*}}/{{$datetime}}` + HMAC/base64/JWT-sign + **AWS SigV4** (profile ~/.aws); pigułki z live-preview + autocomplete
**M3 — UI requestów + two-way curl**: sidebar kolekcji (drzewo, drag&drop), tabele params/headers (enable/disable), path-vars, auth (No-auth/Bearer/Basic/API-Key/SigV4); **two-way curl round-trip: request jako edytowalna komenda curl, live sync GUI↔curl** (serce marki); response viewer (pretty/raw/preview, wirtualizowany dla wielkich JSON-ów + fold + breadcrumb + „copy as jq path"); **timeline waterfall + log `curl -v`** (redagowane sekrety); przełącznik env + quick-look
**M4 — GraphQL explorer** (flagowy): introspekcja z auth-nagłówkami → `buildClientSchema` → autocomplete/lint + checkboxowe drzewo pól (sync obie strony) + Docs Explorer (Cmd-klik) + „Refresh schema" + fallback SDL; panele Variables/Headers; interpolacja w query
**M5 — Subskrypcje GQL**: graphql-ws/graphql-sse, panel streamu, start/stop
**M6 — Interop**: Copy-as-curl 1:1 (maskowanie sekretów, sanityzacja `-`/`@`) + **Copy as… codegen** (fetch/axios/Python requests+httpx/Go/Rust reqwest/Swift); import: curl, **historia zsh (`~/.zsh_history` → wykryte curle → batch)**, Postman v2.1, Insomnia (skrypty `pm.*` z ostrzeżeniem), **HAR z ekranem review** (odszumianie assetów, auto-sekrety→env), **`.http`/`.rest` import+eksport** (dialekt JetBrains, tolerancyjny parser); historia requestów z replay + per-request response history
**M7 — Testy**: **asercje scriptless** (GUI dropdown: status/jsonpath/typ/czas) z fallbackiem do JS; sandbox QuickJS pre/post; **snapshot/golden testing ze scrubbingiem** (timestampy/UUID/JSONPath→placeholdery, „Accept snapshot"); **watch-mode** (obserwuj plik/env → auto re-run, zielony/czerwony)
**M8 — Workflow editor**: canvas (React Flow), nody: request / ekstrakcja JSONPath→zmienna / warunek / delay / retry-until; egzekucja z podglądem per node
**M9 — Analiza i dev-utils**: **diff dwóch odpowiedzi** (split/unified, structural JSON diff, filtr JSONPath, **timing diff**); **mini-benchmark: powtórz N× → histogram p50/p95/p99, klik w outlier → waterfall próby**; **JWT auto-decoder** (badge w odpowiedzi, claims + żywy countdown expiry); jq/JSONPath playground na odpowiedzi; **TLS cert-chain viewer**; cookie manager UI; toolbelt (base64/URL/hex/hash, epoch↔ISO, decode-in-place); **find&replace/bulk-edit po kolekcji**
**M10 — macOS + polish**: **⌘K command palette + globalny hotkey (quick-request z całego systemu)**; **deep-linki `lokowka://`** (adres requestu w notatce/Jirze); menu bar extra (health-kropka env); powiadomienie po długim requeście; Touch ID do odblokowania sekretów; drag&drop `.http`/`.har` na Docka; docs Markdown per request/kolekcja; auto-update (Tauri updater); podpis+notaryzacja
**M11 — CLI `lok` + CI**: headless runner (request/kolekcja/workflow), exit-code z asercji, reportery JUnit/JSON/HTML, GitHub Action; ten sam rdzeń libcurl co GUI
**M12 — Lokalne AI (opcjonalny, OFF domyślnie)**: Ollama (auto-detekcja `api/tags`, zero-config, sugestia modelu wg RAM); wszystko przez ⌘K → artefakt (nie czat): „wyjaśnij błąd" (4xx/5xx+timeline→diagnoza), „wygeneruj asercje" (constrained do naszego DSL), NL→request (uziemiony env+kolekcją), NL→GraphQL query (na LOKALNYM schemacie z introspekcji), „udokumentuj request" (MD); semantyczna historia (sqlite-vec + nomic-embed, fallback FTS5); **warstwa redakcji sekretów przed każdym promptem + prompt-injection guard** (body odpowiedzi = dane, nie instrukcje)

## Anty-bloat (świadomie NIE budujemy)
Panel-czat AI, agentic autopilot, chmurowy fallback AI, LLM-owe mock-data (QuickJS robi to deterministycznie), „AI podsumuj całe API"; **MITM capture-proxy w v1** (HAR daje 80% wartości — capture ewentualnie po v1); capture→OpenAPI; gRPC (dopiero gdy wejdzie do wizji); Raycast na start (dopiero NAD deep-linkami/CLI, po v1); launchd health-monitor; mocki/monitory/chmura/współpraca SaaS — nigdy. OAuth2 full-flow i OpenAPI-import → v2.

## UX/UI — „simple, spectacular"
Jedno okno, trzy strefy (sidebar · edytor · odpowiedź), ⌘K wszędzie, JEDEN tryb storage (lokalny — lekcja z chaosu Insomnii). Tożsamość: „heat gradient" (róż/magenta→pomarańcz — rozgrzana lokówka), dark-first, mono/sans typografia, micro-animacje Motion (wysyłka, waterfall, przełączanie env, glass HUD po długim requeście z drag-out body do Findera), `prefers-reduced-motion` respektowane, app-shell bez scrollowalnego okna. Faza UX (wireframes + tokens + makiety: request editor, GQL explorer, workflow canvas, benchmark histogram) przed M3.

## Delivery — repo, gałęzie, PR-y, review
- **Repo**: `gh repo create bryndalski/lokowka --private` (łatwo upublicznić później) + README + MIT + .gitignore; spec i research w `docs/`
- **Branching**: `main` chroniony (PR-only, squash); gałęzie `feat/m{N}-{slug}`; Conventional Commits; testy osobno od implementacji; SemVer — tag `v0.{N}` po milestone, `v1.0.0` po M12
- **PR flow**: PR per zadanie → CI green (GitHub Actions: rustfmt+clippy+cargo test / tsc+eslint+vitest / Playwright / tauri build, macos runner) → review agentowy (code-quality + security, adversarialnie) jako review na PR → **merge klika user** (nigdy nie merguję sam)
- **Śledzenie**: GitHub Issues per milestone (M1-M12) z checklistami; GitHub Milestones jako fazy
- **Wykonanie**: per milestone — (UX gdy dotyczy) → TDD → review gate → E2E na realnych endpointach (lokalny httpbin/echo + realny GQL) → PR; orkiestracja wieloagentowa (ultracode)

## Ryzyka
- Zakres v1 duży — M1-M4 dają używalną apkę (pierwszy publiczny „wow"); dalsze milestony dokładają niezależnie
- Sekrety: nigdy plaintext w SQLite/eksportach/prompcie AI; dymny grep po dumpie bazy w CI
- Sandbox JS: zero fs/net/process, limity, testy prób ucieczki
- Bundlowanie libcurl + notaryzacja; `.http` = 4 dialekty (parsujemy tolerancyjnie, eksport JetBrains)

## Weryfikacja
- `cargo test`: silnik (escapowanie, cykle, redirect/auth-strip, cookie jar), SigV4 (znane wektory), sandbox (ucieczki), parsery (curl/.http/HAR — golden files)
- `vitest` UI; Playwright E2E: realny httpbin lokalnie + realny GQL endpoint (introspekcja→builder→wysyłka→snapshot)
- Dymne: Copy-as-curl wykonany w terminalu = identyczna odpowiedź; sekret nieobecny w dump SQLite/eksporcie/schowku/prompcie AI; benchmark histogram zgodny z timingami curl
- Po każdej fazie: `cargo clippy` + `tsc --noEmit`; CI gate na PR

## Kroki po zatwierdzeniu
1. `gh repo create bryndalski/lokowka --private` + klon + szkielet Tauri v2 (React+TS) + CI + pierwszy commit na `main` (potem tylko PR-y)
2. Spec → `docs/specs/2026-07-12-lokowka-design.md` + research → `docs/research/`
3. Issues M1-M12 + `superpowers:writing-plans` → plan implementacji per milestone (TDD)
4. Start: M1 (silnik) równolegle z fazą UX pod M3/M4
