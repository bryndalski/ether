# Scriptless Assertions + Snapshot Testing + Watch-Mode — Architecture Blueprint

> **Status:** blueprint (no production code). Target for a coding agent to execute.
> **Stack:** Tauri v2 + React 19 + TypeScript + zustand + CodeMirror 6 (read-only) + Tailwind v4 (utility-only) + design-system v2 (`--lok-*` tokens) + Rust (rusqlite bundled).
> **Contract source of truth:** `src-tauri/src/models.rs` (mirrored in `src/lib/types.ts`) — `StoredRequest`, `ResponseData`, `KeyValue`, `Timings`. The **only** models change is a new `Assertion` type + one new `StoredRequest.assertions` field. **Never** invent any other field.
> **IPC source of truth:** `src-tauri/src/lib.rs` (`invoke_handler!`) + `src/lib/ipc.ts`. This feature adds **three** commands (`snapshot_get` / `snapshot_put` / `snapshot_delete`) and **zero** engine changes; `upsert_request` already round-trips the request and now carries `assertions`.
> **Reuses:** `jsonDiff.ts` (`jsonDiff`, `parseJsonBody`, `jsonType`, `JsonDiffEntry`) — the snapshot diff is a scrubbed `jsonDiff`, nothing new to compute. Also `useSendRequest`, `useRequestDraft`, `RequestTabs`, `ResponseTabs`, `ResponseDock`, `format.ts`, `httpStatus.ts`, the `store.rs` upsert/list/`_json`-column pattern, and the in-memory test harness.

This feature adds three cooperating capabilities to the Request Workbench (`docs/architecture/request-workbench.md`):

1. **Scriptless assertions** — declarative pass/fail checks on a response (no JS, no scripting sandbox), authored in a new **Tests** request-tab and evaluated by a pure FE function after every send.
2. **Snapshot testing** — a user-saved response *baseline*; subsequent sends diff against it after **scrubbing** non-deterministic fields (timestamps, UUIDs, configured JSONPaths) to `{{scrubbed}}` first, so only *real* structural changes fail.
3. **Watch-mode** — a pure-FE toggle that re-runs the current request on an interval or on debounced draft change, showing a green/red verdict (status + assertions) per run with a small recent-runs history.

None of this changes the send/draft/engine contract. Assertions ride along with the stored request; snapshots live in a new table; watch-mode is a client-side loop over the existing `resolve_and_send` path.

Hard rules that govern everything below (from `design-system/MASTER.md` §6 + repo feedback), identical to `history-diff.md`:
- **1 component = 1 file.** All logic in hooks / pure libs; view files stay small (< ~100 lines) and dumb. Types at module scope.
- **Desktop shell:** `100dvh`, **no scrollable window** — only inner panes scroll via `.lok-scroll` (`overflow` + `min-height: 0` on the pane, never the body).
- **A11y non-negotiable:** `focus-visible` heat ring (base.css), `aria-*` on every icon-only button, AA contrast (tokens only — never a hex), `prefers-reduced-motion` hard gate (base.css). Verdicts are **never color-only** — pass carries a check sigil + "Pass" text, fail carries a cross sigil + "Fail" text and an `aria-label`.
- **Tabular numbers** (`.lok-tnums` / `font-variant-numeric: tabular-nums`) on every status code, `ms`, byte size, count, and interval.
- **Icons:** Lucide via the existing `<Icon>` sprite (`common/Icon` + `IconSprite`). No CDN, no emoji-as-icon.
- **Watch is a footgun:** a persistent, unmissable warning that watch-mode hits the endpoint on a cycle (rate-limits, cost, side-effects on non-idempotent verbs).

---

## 0. Scope & the three decisions (read first)

| Concern | Decision | Rationale |
|---|---|---|
| **Assertion evaluation** | Pure FE (`evalAssertions(response, assertions[]) → AssertionResult[]`). No Rust, no scripting engine, no sandbox. | Assertions read a `ResponseData` the FE already holds; keeping them pure makes them trivially unit-testable and side-effect-free. "Scriptless" = a fixed vocabulary of typed checks, not user JS. |
| **Assertion persistence** | **Minimal** store migration: one nullable `assertions_json TEXT` column on `requests`, `schema_version` bumped `1 → 2`, back-compatible read (missing/NULL → `[]`). `upsert_request` serializes `stored.assertions`. `StoredRequest` gains `assertions: Vec<Assertion>` — the **only** models change. | Assertions belong to the request definition (they travel with it, get imported/exported with it). A single nullable column + serde default is the smallest change that is forward- and backward-compatible. |
| **Snapshot persistence** | **New table** `snapshots(request_id PK, baseline_json, scrub_paths_json, created_at)` + three commands (`snapshot_get/put/delete`). NOT on the request row — a snapshot is a distinct lifecycle entity (saved/accepted/deleted independently, one per request). | A snapshot is large (a full response body) and has its own lifecycle. Coupling it to the request row would bloat every `list_requests` and conflate "definition" with "recorded baseline". PK = `request_id` gives exactly one baseline per request with free upsert. |
| **Watch-mode** | Pure FE (`useWatchMode` hook): `setTimeout`-based interval loop **or** debounced draft-change trigger, calling the same `send` path, collecting the last N verdicts, cancelable. No Rust, no background thread. | Watch is orchestration over the existing send lifecycle; it needs no new backend. Timers live in a hook with strict cleanup so a closed workbench / route change / unmount stops the loop (no zombie requests). |

Non-goals (explicit): no assertion scripting/JS, no cross-request test suites/runners, no CI export, no assertion chaining/extraction into variables, no snapshot history (one baseline per request, overwrite-on-accept), no server-side scheduling. These are out of v1.

---

## 1. Scriptless assertions

### 1.1 The assertion model (pure, typed vocabulary)

A single internally-tagged enum, mirrored FE↔Rust exactly like `Body`/`Auth` (serde `tag = "type"`, `rename_all = "snake_case"`). Each assertion is `{ type, ...typed fields, enabled }`. There is **no** free-form operator string — the operator is encoded in the `type`, which keeps evaluation exhaustive and the UI a fixed menu.

**Assertion types (v1 vocabulary):**

| `type` | Fields (besides `enabled`) | Passes when… |
|---|---|---|
| `status_equals` | `expected: u16` | `response.status === expected` |
| `status_in_range` | `min: u16`, `max: u16` | `min <= status <= max` (inclusive) |
| `header_exists` | `name: String` | a header named `name` exists (case-insensitive) |
| `header_equals` | `name: String`, `expected: String` | header `name` value equals `expected` (case-insensitive name; value exact; multi-value → joined `, ` like `headersDiff`) |
| `json_path_exists` | `path: String` | the JSONPath resolves to a present node (even `null`) |
| `json_path_equals` | `path: String`, `expected: String` | the resolved node, JSON-stringified, equals `expected` (see §1.3 coercion) |
| `json_path_type` | `path: String`, `expected_type: JsonType` | `jsonType(node) === expected_type` (reuse `jsonDiff.ts::jsonType` vocabulary) |
| `body_contains` | `substring: String` | `response.body` contains `substring` (raw string search; skipped-as-error when `body_is_base64`) |
| `response_time_below` | `max_ms: f64` | `response.timings.total_ms < max_ms` |

`JsonType` is the exact union already in `jsonDiff.ts`: `"null" | "boolean" | "number" | "string" | "array" | "object"`. Reusing it means `json_path_type` and the diff share one type detector — no drift.

Each variant carries `#[serde(default = "default_true")] enabled: bool` so a disabled assertion is skipped (returns a `skipped` result, not evaluated) — same `enabled` convention as `KeyValue`.

**`models.rs` — the ONLY models change** (add near `Body`/`Auth`, and one field on `StoredRequest`):

```rust
/// A declarative, scriptless response assertion. Evaluated on the FRONTEND
/// (pure `evalAssertions`); Rust only persists it verbatim with the request.
/// Internally tagged like Body/Auth so the TS mirror stays a 1:1 union.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Assertion {
    StatusEquals   { expected: u16,                         #[serde(default = "default_true")] enabled: bool },
    StatusInRange  { min: u16, max: u16,                    #[serde(default = "default_true")] enabled: bool },
    HeaderExists   { name: String,                          #[serde(default = "default_true")] enabled: bool },
    HeaderEquals   { name: String, expected: String,        #[serde(default = "default_true")] enabled: bool },
    JsonPathExists { path: String,                          #[serde(default = "default_true")] enabled: bool },
    JsonPathEquals { path: String, expected: String,        #[serde(default = "default_true")] enabled: bool },
    JsonPathType   { path: String, expected_type: String,   #[serde(default = "default_true")] enabled: bool },
    BodyContains   { substring: String,                     #[serde(default = "default_true")] enabled: bool },
    ResponseTimeBelow { max_ms: f64,                        #[serde(default = "default_true")] enabled: bool },
}
```

`expected_type` is a plain `String` in Rust (Rust never evaluates it; keeping it a string avoids a second Rust enum that must mirror `JsonType`). The TS mirror narrows it to the `JsonType` union.

**`StoredRequest` gains exactly one field** (place it last, `#[serde(default)]` so old JSON without it deserializes):

```rust
    #[serde(default)]
    pub assertions: Vec<Assertion>,
```

`#[serde(default)]` on a `Vec` yields `[]`, so any pre-existing serialized `StoredRequest` (imports, older history-adjacent payloads) and the DB read path both back-fill an empty list. This is what makes the migration transparent.

### 1.2 TS mirror (`src/lib/types.ts`)

```ts
export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

export type Assertion =
  | { type: "status_equals"; expected: number; enabled: boolean }
  | { type: "status_in_range"; min: number; max: number; enabled: boolean }
  | { type: "header_exists"; name: string; enabled: boolean }
  | { type: "header_equals"; name: string; expected: string; enabled: boolean }
  | { type: "json_path_exists"; path: string; enabled: boolean }
  | { type: "json_path_equals"; path: string; expected: string; enabled: boolean }
  | { type: "json_path_type"; path: string; expected_type: JsonType; enabled: boolean }
  | { type: "body_contains"; substring: string; enabled: boolean }
  | { type: "response_time_below"; max_ms: number; enabled: boolean };

// StoredRequest gains:  assertions: Assertion[];
```

> **Coordination note:** `JsonType` currently lives (un-exported) inside `jsonDiff.ts`. Export it there and re-export from `types.ts` (or move the alias to `types.ts` and import it into `jsonDiff.ts`). One source of truth — do not redeclare the union.

### 1.3 Evaluation — `src/lib/assertions.ts` (pure, unit-tested)

```ts
export type AssertionStatus = "pass" | "fail" | "skipped";

export interface AssertionResult {
  assertion: Assertion;
  index: number;               // position in the request's assertion list (stable key)
  status: AssertionStatus;
  message: string;             // human summary, e.g. "status 200 = 200" / "expected 201, got 200"
  actual?: string;             // rendered actual value, for the fail detail
  expected?: string;           // rendered expected value
}

export function evalAssertions(
  response: ResponseData,
  assertions: Assertion[],
): AssertionResult[];

export interface AssertionSummary { total: number; passed: number; failed: number; skipped: number; allPassed: boolean; }
export function summarize(results: AssertionResult[]): AssertionSummary;
```

Rules the implementation must follow:
- **Pure & total.** No throws. A malformed assertion (e.g. a JSONPath that can't parse, or `json_path_*` against a non-JSON / base64 / truncated body) → `status: "fail"` with a diagnostic `message` (e.g. "body is not JSON — cannot evaluate `$.data.id`"), **never** an exception. `body_is_base64` / `body_truncated_at` are respected: JSONPath/`body_contains` against a base64 body → `fail` with "binary body" message rather than a false match.
- **`enabled === false` → `skipped`** (kept in the list so the count is honest and the row still renders muted).
- **Header matching** reuses the case-insensitive join logic already proven in `jsonDiff.ts::headersDiff` (multi-value → joined `, `). Factor that join into a tiny shared helper if convenient; do not duplicate the semantics.
- **JSON body parse** reuses `parseJsonBody` from `jsonDiff.ts` (one parse per eval, memoized across all `json_path_*` assertions in a single call — don't re-parse per assertion).
- **JSONPath** is a **minimal, dependency-free** resolver in the same file: dot/bracket paths only (`$`, `$.a`, `$.a.b`, `$.items[2]`, `$.items[2].id`) — the exact grammar `jsonDiff.ts` already emits as `JsonPath`. No wildcards/filters/recursive-descent in v1 (documented simplification; matches the diff's positional-only philosophy). A path that doesn't resolve → for `json_path_exists` this is a legitimate `fail` (not an error); for `json_path_equals`/`_type` it's a `fail` with "path not found".
- **Value coercion for `json_path_equals`:** compare the resolved node **JSON-stringified** to `expected` after a lenient pass: if `expected` parses as JSON, compare structurally-equal JSON; else compare `String(node)` to `expected`. So `expected:"200"` matches numeric `200`, and `expected:"true"` matches boolean `true`, without forcing the user to know the exact JSON type. Document this coercion in the test matrix.
- **Determinism:** results are returned in assertion-list order (stable `index`) so the UI keys and counts never jump.

`evalAssertions` is called by the workbench after each successful send (and by watch-mode per run) against the `ResponseData` in `sendState.response`. It is **display-only** — it never mutates the response or the request.

### 1.4 Persistence — the minimal migration (`src-tauri/src/store.rs`)

Follow the existing `_json`-column + upsert/list pattern exactly.

1. **`migrate()` — bump to version 2, additively.** Keep the `CREATE TABLE IF NOT EXISTS requests (…)` as-is (new DBs still create without the column, then get it added by the ALTER path — or add the column to the CREATE and rely on the ALTER being a no-op on fresh DBs; pick one and keep them consistent). Add a versioned upgrade step after the initial `schema_version` seed:

```rust
// after reading `current` (Option<i64>):
let version = current.unwrap_or(0);
if version < 2 {
    // Additive, nullable — backfills every existing row with NULL (→ [] on read).
    // ALTER TABLE ADD COLUMN is safe & instant in SQLite; guard against re-run
    // (a fresh DB created with the column present) by ignoring "duplicate column".
    let _ = conn.execute("ALTER TABLE requests ADD COLUMN assertions_json TEXT", []);
    conn.execute("UPDATE schema_version SET version = 2", []).map_err(sql_err)?;
}
```

   - The fresh-install `INSERT INTO schema_version VALUES (1)` stays; the `< 2` block then immediately advances a brand-new DB to 2 as well, so there is exactly one code path. The `let _ =` on the ALTER tolerates the "duplicate column name" error when a fresh DB already has the column (idempotent migration).
   - **No destructive change.** No table drop/rename, no data rewrite. An old row simply reads `assertions_json = NULL → assertions = []`.

2. **`row_to_request` — read the new column (nullable → `[]`).** The `requests` `SELECT` gains `assertions_json` (index 13). Deserialize:

```rust
let assertions: Vec<Assertion> = match row.get::<_, Option<String>>(13).map_err(sql_err)? {
    Some(raw) if !raw.is_empty() => serde_json::from_str(&raw).map_err(json_err)?,
    _ => Vec::new(),   // NULL / empty (old rows) → []
};
```

   Add `assertions` to the constructed `StoredRequest`. Both `list_requests` SELECT strings must add `, assertions_json` at the end of the column list.

3. **`upsert_request` — serialize & write.** Serialize `stored.assertions` (default `[]` serializes to `"[]"`, never NULL going forward) and add `assertions_json` to the INSERT column list, the `VALUES (…?14)`, and the `ON CONFLICT DO UPDATE SET assertions_json = excluded.assertions_json`.

```rust
let assertions_json = serde_json::to_string(&stored.assertions).map_err(json_err)?;
```

   Everything else in `upsert_request` is unchanged. `StoredRequest` equality in the existing round-trip tests now includes `assertions` — the sample builder must set it (default `vec![]` keeps old assertions passing; add one populated case).

No IPC change for assertions: they ride `upsert_request` / `list_requests`, already wired in `ipc.ts` (`upsertRequest` / `listRequests`). The only `ipc.ts` edit is the type import (`Assertion`) flowing through `StoredRequest`.

---

## 2. Snapshot testing

### 2.1 Concept & lifecycle

A **snapshot** is a saved baseline `ResponseData` for a request plus the JSONPaths the user marked as non-deterministic (to scrub before comparing).

- **Save snapshot** (explicit user action, from the response dock) → `snapshot_put(request_id, baseline_json, scrub_paths_json)` writing the *current* `sendState.response` as the baseline. Overwrites any existing baseline (PK upsert).
- **Compare** happens after every subsequent send while a snapshot exists: scrub both the baseline body and the new body with the same `scrub_paths`, then `jsonDiff(scrubbedBaseline, scrubbedCurrent)`. **Pass** = empty diff; **Fail** = any entry (new/removed field, type-change, or value change on a non-scrubbed path).
- **Accept snapshot** → re-run `snapshot_put` with the *current* response as the new baseline (adopt the change). Same command, different payload.
- **Delete snapshot** → `snapshot_delete(request_id)`; the snapshot section disappears and comparison stops.

One snapshot per request (PK = `request_id`), matching the "one baseline" mental model. Cascade: when a request is deleted, its snapshot must go too (see §2.4).

### 2.2 Scrubbing — `src/lib/scrub.ts` (pure, unit-tested)

Scrubbing replaces non-deterministic leaf values with the literal placeholder `"{{scrubbed}}"` **before** diffing, so timestamps/UUIDs/etc. never cause false failures.

```ts
export const SCRUBBED = "{{scrubbed}}";

export interface ScrubConfig {
  paths: string[];        // explicit JSONPaths to scrub (same grammar as assertions/jsonDiff)
  autoTimestamps: boolean; // heuristic: ISO-8601 date-time strings
  autoUuids: boolean;      // heuristic: RFC-4122 UUID strings
}

/** Returns a DEEP CLONE with matched leaves replaced by SCRUBBED. Never mutates input. */
export function scrubValue(value: unknown, config: ScrubConfig): unknown;

/** Convenience: parse a body, scrub, or fall back to raw text for non-JSON. */
export function scrubBody(body: string, config: ScrubConfig):
  | { ok: true; value: unknown }
  | { ok: false; reason: string };
```

Rules:
- **Explicit paths** (highest precedence): each path in `config.paths` (dot/bracket grammar) points at a node; that node's value → `SCRUBBED`. A path may point at an object/array (scrub the whole subtree to `SCRUBBED`) or a leaf.
- **Auto timestamps** (`autoTimestamps`): a *string* leaf matching an ISO-8601 date-time (a conservative regex: `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?`) → `SCRUBBED`. Numbers are **not** auto-scrubbed (epoch millis are ambiguous with real data; the user scrubs those by explicit path).
- **Auto UUIDs** (`autoUuids`): a *string* leaf matching the RFC-4122 pattern (`[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`, case-insensitive) → `SCRUBBED`.
- **Pure & non-mutating:** always deep-clone; never touch the argument (the live response must be untouched for display).
- **Deterministic:** same input + config → same output (walk keys in a stable order; scrubbing is idempotent — scrubbing an already-scrubbed value is a no-op).
- **Non-JSON bodies:** `scrubBody` returns `{ ok:false }` for base64/truncated/non-JSON; the snapshot compare then falls back to a **raw text equality** check (equal → pass; differ → fail with "non-JSON body — textowe porównanie") and the auto/path scrubbing is skipped (can't path into non-JSON). Document this like the diff's text fallback.

### 2.3 Snapshot compare — `src/lib/snapshot.ts` (pure, unit-tested, reuses `jsonDiff`)

```ts
export interface SnapshotVerdict {
  status: "pass" | "fail" | "no-baseline" | "non-json";
  diff: JsonDiffEntry[];   // [] on pass; the scrubbed structural diff on fail
  addedCount: number; removedCount: number; changedCount: number; // for the badge
}

export function compareSnapshot(
  baseline: ResponseData | null,
  current: ResponseData,
  config: ScrubConfig,
): SnapshotVerdict;
```

Algorithm:
1. `baseline == null` → `{ status: "no-baseline", diff: [] }` (UI shows "Save snapshot" affordance only).
2. If either body is non-JSON/base64/truncated (`scrubBody` `ok:false` on either side) → raw text compare of the two bodies (after they're both non-JSON): equal → `pass`; differ → `{ status: "non-json" }` with a single synthetic diff entry (`kind:"changed"` on `$`) so the UI can say "bodies differ (text)".
3. Both JSON → `scrubValue` each, then `diff = jsonDiff(scrubbedBaseline, scrubbedCurrent)`. `diff.length === 0` → `pass`; else `fail`. Counts derived from `diff` by `kind` (`type-changed` folded into `changedCount`).

> **Reuse is mandatory:** the diff engine is `jsonDiff` verbatim (per the master instruction "REUSE jsonDiff.ts do snapshot diff!"). Snapshot adds only *scrubbing before* and *verdict interpretation after* — no second diff implementation. The snapshot fail view renders the same `JsonDiffEntry[]` UI as `history/JsonDiffView` (extract that view to a shared `common/JsonDiffView` if not already shared, so history-diff and snapshot render identically).

### 2.4 Snapshot store — new table + three commands (`src-tauri/src/store.rs`)

**Migration (in the same `< 2` block or a `< 3` step — keep it one linear ladder):** add the table with `CREATE TABLE IF NOT EXISTS` (so it's created on both fresh installs and upgrades):

```sql
CREATE TABLE IF NOT EXISTS snapshots (
    request_id     TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
    baseline_json  TEXT NOT NULL,      -- serialized ResponseData
    scrub_paths_json TEXT NOT NULL,    -- serialized ScrubConfig (paths + auto flags)
    created_at     TEXT NOT NULL       -- rfc3339, like gql_schema_cache.fetched_at
);
```

- `ON DELETE CASCADE` on `request_id` means deleting a request drops its snapshot automatically — **no** change to `delete_request` needed (foreign_keys is `ON` in both `init` and `init_in_memory`). This mirrors how `requests.collection_id` cascades from `collections`.
- Put the `CREATE TABLE snapshots` alongside the other `CREATE TABLE IF NOT EXISTS` in `migrate()`'s `execute_batch` **and** ensure the `schema_version` advances to 2 (assertions) — the snapshot table needs no ALTER, just the CREATE, so it can live in the always-run batch. (If you prefer strict versioning, gate both behind `< 2`; either is fine as long as fresh + upgrade both end at version 2 with both changes applied.)

**A `SnapshotRecord` persistence entity** (in `models.rs` — this is persistence-level, alongside `Collection`/`HistoryEntry`, and does *not* count as a contract-field change to `StoredRequest`; it's a new struct, not a modified one):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotRecord {
    pub request_id: String,
    pub baseline: ResponseData,          // stored as baseline_json
    pub scrub_config: ScrubConfig,       // stored as scrub_paths_json
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ScrubConfig {
    #[serde(default)] pub paths: Vec<String>,
    #[serde(default)] pub auto_timestamps: bool,
    #[serde(default)] pub auto_uuids: bool,
}
```

> Note: the task specifies "the only models change" as `StoredRequest.assertions`. `SnapshotRecord`/`ScrubConfig` are **new** persistence structs (like `HistoryEntry` was), not modifications to the shared request/response contract — they don't touch `RequestSpec`/`ResponseData`/`StoredRequest` shape beyond the one `assertions` field. This respects the intent (no churn to the executed-request contract). If a reviewer wants zero new Rust structs, the commands can instead take/return raw `(baseline_json: String, scrub_paths_json: String)` strings and let the FE own (de)serialization — pick one; the typed struct is cleaner and the tests are simpler. **This blueprint uses the typed struct.**

**Three commands** (mirror the `gql_schema_get/put` shape — the closest existing precedent):

```rust
#[tauri::command]
pub fn snapshot_get(request_id: String) -> Result<Option<SnapshotRecord>, String> { … }

#[tauri::command]
pub fn snapshot_put(record: SnapshotRecord) -> Result<SnapshotRecord, String> {
    // created_at defaulted to now() if empty; INSERT … ON CONFLICT(request_id)
    // DO UPDATE SET baseline_json, scrub_paths_json, created_at.
}

#[tauri::command]
pub fn snapshot_delete(request_id: String) -> Result<(), String> { … }
```

- `snapshot_get` → `SELECT baseline_json, scrub_paths_json, created_at FROM snapshots WHERE request_id = ?1`, `.optional()`, deserialize the two JSON columns into `ResponseData` / `ScrubConfig`. `None` when absent.
- `snapshot_put` → serialize `record.baseline` and `record.scrub_config`, `INSERT … ON CONFLICT(request_id) DO UPDATE SET …` (upsert = both Save and Accept). Stamp `created_at = Utc::now().to_rfc3339()` when the incoming one is empty.
- `snapshot_delete` → `DELETE FROM snapshots WHERE request_id = ?1`.

**Register in `lib.rs`** — add to `generate_handler![ … ]`:

```rust
store::snapshot_get,
store::snapshot_put,
store::snapshot_delete,
```

**`ipc.ts` wrappers** (arg keys must match Rust param names exactly):

```ts
export function snapshotGet(requestId: string): Promise<SnapshotRecord | null> {
  return invoke("snapshot_get", { requestId });
}
export function snapshotPut(record: SnapshotRecord): Promise<SnapshotRecord> {
  return invoke("snapshot_put", { record });
}
export function snapshotDelete(requestId: string): Promise<void> {
  return invoke("snapshot_delete", { requestId });
}
```

TS mirrors `SnapshotRecord` / `ScrubConfig` in `types.ts` (1:1, snake_case fields: `request_id`, `baseline`, `scrub_config`, `created_at`; `ScrubConfig`: `paths`, `auto_timestamps`, `auto_uuids`).

---

## 3. Watch-mode (pure FE)

### 3.1 Behaviour

A **Watch** toggle on the request that, while on, auto-re-runs the current request and shows a live verdict per run:
- **Interval trigger:** every `intervalSec` (configurable **2–30 s**, tabular-nums stepper). A run fires, then the next timer is scheduled *after* the run settles (no overlap — never start run N+1 while N is in flight).
- **Draft-change trigger:** when the draft changes while watching, a **debounced** (e.g. 600 ms) run fires. Interval and draft-change can both be enabled; a draft-change run resets the interval clock so you don't get a double-fire.
- **Per-run verdict:** status (2xx-class green / else red), assertion summary (`passed/total`), and snapshot verdict if a baseline exists — combined into one **green (all pass) / red (any fail)** result with sigils, never color-only.
- **Recent runs:** keep the last **N** (default 10) verdicts in a ring buffer, newest first: timestamp, status, `total_ms`, assertions `p/t`, snapshot ✓/✗. A tiny sparkline of pass/fail is a nice-to-have (CSS only, reduced-motion safe).
- **Stop/cancel:** an explicit Stop, plus **automatic stop** on unmount, on switching the active request, and on window blur? (No — keep it running on blur; that's the point of watch. But it MUST stop on unmount / request switch to avoid firing against a stale draft.) Stopping clears timers and any pending debounce and marks the loop idle.

### 3.2 Hook — `src/hooks/useWatchMode.ts`

```ts
export interface WatchConfig { intervalSec: number; onInterval: boolean; onDraftChange: boolean; maxRuns: number; }
export interface WatchRun {
  at: number;                         // Date.now() when it settled
  status: number | null;             // response status (null on send error)
  totalMs: number | null;
  assertions: AssertionSummary | null;
  snapshot: SnapshotVerdict["status"] | null;
  ok: boolean;                        // overall pass = status-class ok && assertions.allPassed && snapshot!=="fail"
  error: string | null;
}
export interface UseWatchMode {
  watching: boolean;
  runs: WatchRun[];                   // newest first, capped at maxRuns
  start: () => void;
  stop: () => void;
  config: WatchConfig;
  setConfig: (patch: Partial<WatchConfig>) => void;
}

export function useWatchMode(args: {
  draft: StoredRequest;
  environmentId: string | null;
  send: (draft, env) => Promise<ResponseData | null>;  // a thin runner over resolve_and_send
  assertions: Assertion[];
  snapshotConfig: ScrubConfig | null;
  baseline: ResponseData | null;
}): UseWatchMode;
```

Implementation constraints (this is where bugs hide — spell them out):
- **One timer at a time**, stored in a `ref`; scheduled via `setTimeout` **after** each run resolves (recursive schedule), never `setInterval` (which would overlap on slow endpoints). Guard with a `runningRef` so a draft-change trigger can't start a run while one is in flight (queue at most one).
- **Cleanup is mandatory:** `useEffect` cleanup + `stop()` clear the timeout ref and the debounce ref; a `mountedRef`/`abortRef` prevents `setState` after unmount. Switching the active request (`activeRequestId` change) calls `stop()` — a watch never runs against a request you navigated away from.
- **Uses the real send path:** `send` is a runner that calls `resolveAndSend` (via `useSendRequest.send` or a lean direct wrapper) so watch exercises the exact same interpolation/secrets/engine path as a manual send — **no mocks, real endpoint** (this is the whole point, and matches the repo's "E2E on real endpoints" ethos). Each settled response is fed to `evalAssertions` + `compareSnapshot` to build the `WatchRun`.
- **Verdict derivation is pure:** the `ok` flag composes `httpStatus` class-ok + `assertions.allPassed` + `snapshot !== "fail"`. This composition is a tiny pure helper (`watchVerdict(...)`) so it's unit-testable without timers.
- **Interval bounds** are clamped `[2, 30]` in `setConfig` (defensive; the UI stepper also enforces it).

### 3.3 The warning (non-negotiable)

Watch hits the endpoint repeatedly. The UI MUST show, whenever watch is **on**, a persistent, unmissable caution (heat/`warn` treatment, `role="status"` `aria-live="polite"`): *"Watch aktywny — request jest wysyłany co N s. Uderza w prawdziwy endpoint (limity, koszty, skutki uboczne dla POST/PUT/DELETE)."* Starting watch on a **non-idempotent method** (POST/PUT/PATCH/DELETE) additionally requires a one-time confirm (`role="alertdialog"`): *"To nie jest GET — każdy przebieg realnie zmienia dane. Włączyć watch?"* — Cancel / Włącz mimo to. This is the safety gate; never auto-start a destructive loop silently.

---

## 4. UI

### 4.1 Request side — the **Tests** tab

Add `"Tests"` to the request tab strip (`RequestTabs.tsx`) — alongside `Params / Headers / Body / Auth / cURL`. Per the existing pattern it gets a **count chip** = number of enabled assertions.

```
RequestTabs (existing — add "Tests" between "Auth" and "cURL")
│  count chip = enabled assertion count (from draft.assertions)
│
└── workbench/tests/TestsPanel.tsx          (NEW — the tab body, .lok-scroll)
    ├── tests/AssertionList.tsx              (rows; add/remove/reorder like KeyValueTable)
    │   └── tests/AssertionRow.tsx           (one assertion)
    │       ├── tests/AssertionTypeSelect.tsx (the fixed type menu — 9 types)
    │       └── tests/AssertionFields.tsx     (type-driven inputs: expected / path / range / name …)
    └── tests/SnapshotConfigCard.tsx         (scrub paths editor + auto-timestamp/uuid toggles)
```

- `TestsPanel` reads `draft.assertions` and dispatches a new `useRequestDraft` action `setAssertions` (add to the reducer: `{ kind: "setAssertions"; assertions: Assertion[] }` → `{ ...draft, assertions }`). This is the same shape as `setHeaders`/`setParams` — assertions become part of the dirty-check (`isRequestDirty`) and are saved via `saveRequest` (`upsert_request`). No new persistence wiring beyond the reducer action + the store column (§1.4).
- **`AssertionTypeSelect`** — a `<select>`/menu of the 9 types; changing type swaps the field set (`AssertionFields` renders inputs per `type`). Each row has an `enabled` checkbox (reuse the `KeyValueTable` enable pattern), a drag handle for reorder (reuse `reorder.ts`), and a remove ✕ (`aria-label`).
- **`AssertionFields`** — type-driven: `status_equals` → one numeric input (`.lok-tnums`); `status_in_range` → min/max; `header_*` → name (+ expected); `json_path_*` → a JSONPath text input (mono, `--lok-syn-key` tint) (+ expected / a `JsonType` select for `_type`); `body_contains` → substring; `response_time_below` → numeric ms. A blank row template appends a new `status_equals` (a sensible default).
- **`SnapshotConfigCard`** — the scrub config editor: a `KeyValueTable`-style list of JSONPaths to scrub, plus two toggles (**Auto-scrub timestamps**, **Auto-scrub UUIDs**). Editing it updates the `ScrubConfig`; it's only meaningful once a baseline exists but can be pre-configured. Save writes via `snapshot_put` (adopting the current baseline) or is held until the first "Save snapshot" — v1: the card edits an in-memory `ScrubConfig` that's persisted with the snapshot on Save/Accept.

### 4.2 Response side — verdicts, snapshot diff, watch

Extend the response tab strip (`ResponseTabs.tsx`) with **conditional** tabs (same pattern as `Bench`/`Cert`/`JWT` — only show when relevant):

```
ResponseTabs (existing — add three conditional tabs)
│  "Tests"    → shown when draft.assertions.length > 0        (chip = passed/total)
│  "Snapshot" → shown when a baseline exists OR a response is present (to allow "Save snapshot")
│  "Watch"    → shown when watch is active (or always, as a toggle entry point — decide: entry point lives in the toolbar; the tab shows live runs)
│
├── response/tests/AssertionResultsView.tsx   (NEW — evalAssertions(response, assertions) rows)
│   └── tests/AssertionResultRow.tsx           (pass ✓ / fail ✗ / skipped ○, message, expected vs actual)
├── response/snapshot/SnapshotView.tsx          (NEW — verdict + Save/Accept/Delete + diff)
│   ├── snapshot/SnapshotToolbar.tsx            (Save snapshot | Accept | Delete + created_at)
│   └── common/JsonDiffView.tsx                 (REUSED — the scrubbed jsonDiff render, shared with history)
└── response/watch/WatchPanel.tsx               (NEW — recent runs list + interval control + Stop + WARNING)
    └── watch/WatchRunRow.tsx                    (one WatchRun: time, status, ms, p/t, snap)
```

- **`AssertionResultsView`** — runs `evalAssertions(sendState.response, draft.assertions)` (memoized on `[response, assertions]`), shows a header summary (`AssertionSummary`: "3/4 passed · 1 failed") and one row per result. Row: verdict sigil + text (`✓ Pass` `--lok-status-success`; `✗ Fail` `--lok-status-danger`; `○ Skipped` `--lok-status-neutral`), the assertion's human label ("status = 201", "`$.data.id` exists"), and on fail the `expected` vs `actual` (mono, tabular-nums for numbers). **Never color-only** — sigil + "Pass"/"Fail" text + `aria-label` ("Asercja spełniona: status = 201").
- **`SnapshotView`** — reads the request's snapshot via `snapshotGet(requestId)` (cached in the snapshot store, §5), computes `compareSnapshot(baseline, response, scrubConfig)` and renders:
  - `no-baseline` → a **Save snapshot** CTA + a one-line explainer ("Zapisz bieżącą odpowiedź jako wzorzec; kolejne wysyłki będą z nią porównywane, z pominięciem pól scrubowanych.").
  - `pass` → a green "Snapshot: zgodny" banner (✓ sigil) + created_at, with **Accept** disabled and **Delete** available.
  - `fail` → a red "Snapshot: zmiana wykryta (N+ / M− / K~)" banner (✗ sigil) + the scrubbed `JsonDiffView` (added/removed/changed, `+/−/~` sigils — identical to history diff) + **Accept snapshot** (adopt = re-`snapshot_put` current) and **Delete**.
  - `non-json` → "Snapshot: odpowiedzi różnią się (porównanie tekstowe)".
  - All numeric counts `.lok-tnums`; Accept/Delete are `<button>`s with `aria-label`; Accept on a destructive-looking change still just overwrites the baseline (no data risk) so no confirm needed, but Delete confirms (`role="alertdialog"`, "Usunąć wzorzec snapshotu?").
- **`WatchPanel`** — the persistent **warning** (§3.3) at the top, an interval stepper (2–30 s, tabular-nums), the on-interval / on-draft-change toggles, a **Stop** button, and the recent-runs list (newest first). Each `WatchRunRow`: relative/clock time, status badge, `total_ms`, assertions `p/t`, snapshot ✓/✗, overall ✓/✗. Reduced-motion collapses any sparkline animation.

**Watch entry point** lives in the request toolbar (near Send) as a **Watch toggle** (`i-eye`/`i-radar`, `aria-pressed`), not buried in a tab — it's a mode, like an on-air light. Toggling on: shows the confirm for non-GET, then starts the loop and reveals the Watch tab. The active state uses the heat accent (this is a legitimate "on/hot" state per the design system — watch = the one thing that's "on").

### 4.3 Cross-cutting UI rules (applied to every new component)

- **Shell:** `TestsPanel`, `AssertionResultsView`, `SnapshotView`, `WatchPanel` bodies scroll via `.lok-scroll` (`min-height:0`); nothing grows the window. The response dock stays `100dvh`-bounded.
- **A11y:** every verdict is sigil + text (never color-only); icon-only buttons (remove ✕, Stop, Save/Accept/Delete, Watch toggle, reorder handle) have `aria-label`; the new response tabs join the existing `role="tablist"` with arrow-key nav + `aria-selected`; the watch warning + assertion summary are `aria-live="polite"`; Delete/non-GET-watch confirms are `role="alertdialog"` with `aria-describedby`.
- **Reduced motion:** watch sparkline, verdict pulse, snapshot banner slide are CSS → base.css hard gate collapses them.
- **Tabular numbers:** status codes, `ms`, interval seconds, counts, expected/actual numerics — all `.lok-tnums`.
- **Tokens only:** pass=`--lok-status-success*`, fail=`--lok-status-danger*`, skipped/neutral=`--lok-status-neutral`, watch-active/changed=heat (`--lok-heat-*` / `color-mix`), warning=`--lok-status-warn*`. Never a hardcoded hex. Reuse `.kv` grid, `.resp-*`, `.request-row.active` heat bar, the `count` chip.
- **File size:** each view < ~100 lines; all branching in hooks/pure libs (`assertions`, `scrub`, `snapshot`, `useWatchMode`). One component = one file.

---

## 5. State + wiring

- **`useSnapshotStore` (zustand, `src/state/useSnapshotStore.ts`)** — thin, mirrors `useHistoryStore`'s style: `{ record: SnapshotRecord | null; loading; error; load(requestId); save(requestId, response, scrubConfig); accept(requestId, response, scrubConfig); remove(requestId); }`. `load` → `snapshotGet`; `save`/`accept` → `snapshotPut`; `remove` → `snapshotDelete`. It owns **no** compare logic — `SnapshotView` computes `compareSnapshot` from `record` + the live response via the pure lib. Reload on active-request change.
- **Assertions** need no store — they live in the draft (`useRequestDraft`, `setAssertions` action) and persist with `saveRequest`. `AssertionResultsView` computes results from `sendState.response` + `draft.assertions` purely.
- **Watch** is `useWatchMode`, owned by `RequestWorkbench` (it already owns `draft`, `sendState`, `send`). Feed it `draft`, `activeEnvironmentId`, a `send` runner (returns the response or null), `draft.assertions`, the snapshot `record.scrub_config` + `record.baseline`. Watch stops on `activeRequestId` change (the workbench already re-seeds the draft on that key).
- **`RequestWorkbench` wiring:** after each manual send settles, results/verdict recompute automatically (memoized from `sendState.response`); the snapshot store is already loaded for the active request. Watch shares the same `send` path. No new global wiring beyond the snapshot store + the watch hook.

---

## 6. IPC surface — precise delta

| Command | Direction | New? | Notes |
|---|---|---|---|
| `upsert_request` | FE→Rust | **extended** | now serializes `assertions_json`; no signature change (still takes `StoredRequest`) |
| `list_requests` | Rust→FE | **extended** | now selects & returns `assertions` (default `[]` for old rows) |
| `snapshot_get` | FE→Rust | **NEW** | `{ requestId }` → `Option<SnapshotRecord>` |
| `snapshot_put` | FE→Rust | **NEW** | `{ record }` → `SnapshotRecord` (upsert = Save/Accept) |
| `snapshot_delete` | FE→Rust | **NEW** | `{ requestId }` → `()` |

Assertion evaluation, scrubbing, snapshot compare, and the watch loop are **all pure FE** — zero engine involvement. The engine (`resolve_and_send`) is untouched.

---

## 7. Test plan

Mirror the existing conventions: Rust tests use the in-memory store (`init_in_memory` + the `TEST_LOCK` + table-reset `setup()`); FE tests are Vitest, mocking the Tauri boundary (`vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))`) and asserting on **invoke command name + payload**, not internals.

### 7.1 RUST (`cargo test`, in-memory store)

Add to `store.rs`'s `#[cfg(test)] mod tests` (extend the `sample_request` builder to set `assertions`; add a populated variant):

- **`assertions_json` round-trip** — upsert a request with a mix of assertion types (`status_equals`, `json_path_equals`, `header_exists`, `response_time_below`), list it back, assert full equality (`assertions` preserved, order + `enabled` intact).
- **Empty assertions default** — upsert a request with `assertions: vec![]`, read back → `[]` (serializes to `"[]"`, not NULL).
- **Backward compatibility (old row without `assertions_json`)** — insert a `requests` row **manually via raw SQL** with `assertions_json` set to `NULL` (simulating a pre-migration row), then `list_requests` → the row deserializes with `assertions == vec![]` (no error, the nullable read path). This is the critical migration test.
- **Migration idempotence** — call `migrate` twice on the same connection (the `ALTER … ADD COLUMN` guarded by `let _ =`) → no error, `schema_version == 2`, column present exactly once.
- **Snapshot CRUD** — `snapshot_get(unknown)` → `None`; `snapshot_put(record)` then `snapshot_get` → `Some(record)` (baseline `ResponseData` + `ScrubConfig` round-trip byte-for-byte); a second `snapshot_put` for the same `request_id` **overwrites** (Accept semantics), `get` returns the new baseline; `snapshot_delete` → `get` is `None`.
- **Snapshot cascade on request delete** — put a request + a snapshot for it, `delete_request(id)` → `snapshot_get(id)` is `None` (FK `ON DELETE CASCADE`; asserts `foreign_keys=ON` is actually wired in the in-memory path).
- **`created_at` defaulting** — `snapshot_put` with empty `created_at` → stored `created_at` is a non-empty rfc3339 string.

### 7.2 FE (`vitest run`)

**Pure libs (fast, no DOM):**
- **`assertions.test.ts`** — one assertion **per type**, pass + fail:
  - `status_equals` pass/fail; `status_in_range` inclusive bounds (min, max, below, above); `header_exists` case-insensitive present/absent; `header_equals` value match + multi-value join; `json_path_exists` present (incl. a `null` node → still exists) vs missing; `json_path_equals` with coercion (`"200"`↔`200`, `"true"`↔`true`, string match) pass/fail; `json_path_type` each `JsonType` (array vs object distinguished); `body_contains` present/absent; `response_time_below` under/over.
  - **Robustness:** `json_path_*` against non-JSON body → `fail` with message (no throw); against base64 body → `fail` "binary body"; `enabled:false` → `skipped`. `summarize` counts (passed/failed/skipped/allPassed).
- **`scrub.test.ts`** — explicit path scrub (leaf + whole subtree); auto-timestamp ISO match (and a non-ISO string left intact); auto-uuid match (and a non-uuid left intact); numbers never auto-scrubbed; non-mutation (input deep-equal after call); idempotence (scrub∘scrub == scrub); non-JSON body → `ok:false`.
- **`snapshot.test.ts`** — `no-baseline` when baseline null; **pass** when only scrubbed fields differ (timestamp/uuid change scrubbed away → empty diff); **fail** on a real added/removed/type-changed field (assert `addedCount`/etc.); reuses `jsonDiff` (a value change on a non-scrubbed path → `changedCount == 1`); `non-json` text fallback path (base64/truncated body).
- **`watchVerdict`** (pure) — `ok` true only when status-class ok AND `assertions.allPassed` AND snapshot !== "fail"; each failing dimension flips `ok` to false.

**Hook — `useWatchMode.test.ts`** (fake timers `vi.useFakeTimers()`, mock the `send` runner):
- **Interval loop calls the send runner** — start watch, advance timers by `intervalSec`, assert the mocked `send` (→ `resolve_and_send`) fired; each settled response produces a `WatchRun` with `assertions`/`snapshot`/`ok` computed; `runs` capped at `maxRuns` (newest first).
- **No overlap** — with a slow (pending) send, advancing the timer does **not** start a second run until the first resolves.
- **Debounced draft-change trigger** — changing the draft while watching fires one run after the debounce (not per keystroke); resets the interval clock.
- **`stop()`** — clears timers; after stop, advancing time fires **no** further sends; `watching === false`.
- **cleanup on unmount** — unmounting the hook clears timers (no send after unmount; no `setState`-after-unmount warning).
- **interval clamp** — `setConfig({ intervalSec: 1 })` clamps to 2; `40` clamps to 30.

**Store — `useSnapshotStore.test.ts`** — `load` invokes `("snapshot_get", { requestId })` and stores the record; `save`/`accept` invoke `("snapshot_put", { record })` with the current response as baseline; `remove` invokes `("snapshot_delete", { requestId })` and nulls the record; reject paths set `error` without throwing.

**Component render (RTL):**
- **TestsPanel** renders a row per `draft.assertions`, the type select offers all 9 types, adding a row dispatches `setAssertions`, the tab count chip = enabled count.
- **AssertionResultsView** given a response + assertions renders pass/fail/skipped rows with **sigil + text** (not color-only), the summary header, and expected-vs-actual on fail; `aria-label`s present.
- **SnapshotView** — `no-baseline` shows Save CTA; **Save** invokes `("snapshot_put", …)`; a `fail` verdict renders the scrubbed `JsonDiffView` with `+/−/~` sigils and **Accept**; Accept invokes `("snapshot_put", …)` again (overwrite); **Delete** confirms then invokes `("snapshot_delete", …)`.
- **WatchPanel** — the persistent warning is present while watching (`role="status"`); toggling watch on a **POST** shows the non-idempotent confirm (`role="alertdialog"`) and only starts on confirm; recent-runs rows show status/ms/`p/t`/snap with tabular-nums; Stop halts the loop.
- **A11y smoke** — new response tabs expose `role="tab"`/`aria-selected`; icon-only buttons have accessible names; verdicts are never color-only.

---

## 8. Execution order for the coding agent

1. **Contract:** add `Assertion` enum + `StoredRequest.assertions` to `models.rs`; add `SnapshotRecord`/`ScrubConfig`; mirror all in `types.ts`; export/reuse `JsonType` from one place.
2. **Store (Rust):** migration (`schema_version → 2`, `ALTER … ADD assertions_json`, `CREATE TABLE snapshots`), extend `row_to_request`/`list_requests`/`upsert_request` for `assertions_json`, add `snapshot_get/put/delete`; register in `lib.rs`; **Rust tests** (round-trip, back-compat NULL row, migration idempotence, snapshot CRUD + cascade). `cargo test` + `cargo clippy -D warnings` green.
3. **IPC (FE):** `ipc.ts` wrappers `snapshotGet/Put/Delete`; type imports flow through `StoredRequest`.
4. **Pure libs + tests:** `assertions.ts` (`evalAssertions`, `summarize`, the minimal JSONPath resolver), `scrub.ts` (`scrubValue`, `scrubBody`, auto heuristics), `snapshot.ts` (`compareSnapshot`, reusing `jsonDiff`), `watchVerdict`. Fast feedback, zero UI risk.
5. **Hook + store:** `useWatchMode.ts` (+ tests, fake timers) and `useSnapshotStore.ts` (+ tests). Add `setAssertions` to `useRequestDraft`.
6. **Request UI:** `Tests` tab in `RequestTabs`; `TestsPanel` → `AssertionList`/`AssertionRow`/`AssertionTypeSelect`/`AssertionFields`; `SnapshotConfigCard`.
7. **Response UI:** conditional `Tests`/`Snapshot`/`Watch` tabs in `ResponseTabs`; `AssertionResultsView`/`AssertionResultRow`; `SnapshotView`/`SnapshotToolbar` + shared `JsonDiffView`; `WatchPanel`/`WatchRunRow`; Watch toggle in the toolbar with the non-GET confirm + persistent warning.
8. **Gate:** `npm run typecheck` + `npm run test:unit` + `cargo test` + `cargo clippy --all-targets -- -D warnings` all green; visual parity (both themes); no scrollable window; i18n-free copy stays PL like the rest of the app; **watch never overlaps runs and always stops on unmount/request-switch**; `•••`-free (assertions/snapshots persist non-secret data — a baseline `ResponseData` is a real response body, so document that snapshots may contain response payloads and are stored locally in SQLite, same trust boundary as history).

**Definition of done:** typecheck clean; Rust + FE unit tests green; `clippy -D warnings` clean; the migration is additive and back-compatible (old rows read `assertions == []`); assertions round-trip through `upsert_request`/`list_requests`; snapshot CRUD works and cascades on request delete; `evalAssertions` covers all 9 types purely (no throws on bad input); scrubbing removes non-deterministic fields before an otherwise-`jsonDiff` compare so only real changes fail; Save/Accept/Delete snapshot works; watch re-runs the **real** request on interval/debounced-draft, shows green/red verdicts, caps recent runs, warns loudly, confirms on non-GET, and **always** stops on unmount/request-switch with no zombie timers; every verdict is sigil + text (never color-only); a11y + reduced-motion + tabular-nums satisfied; `100dvh`, no scrollable window.

---

## 9. Related: pre/post-request scripts

Beyond the 9 scriptless assertion types documented above, a request may also carry
sandboxed **pre/post-request scripts** (QuickJS via rquickjs — see
`docs/architecture/quickjs-scripts.md`). A **post-script**'s `lok.expect(...)` /
`lok.test(...)` results are `ScriptTest { name, passed }` values that join the SAME
pass/fail verdict as the scriptless `AssertOutcome`s: a request's overall result =
(scriptless assertions) ∪ (script tests). The two mechanisms are complementary —
scriptless assertions cover the fixed, closed set of checks with zero code; scripts
are the escape hatch for computed/derived checks (decode a JWT, reshape a payload,
assert on an extracted value). Both are surfaced together in the Tests summary.
