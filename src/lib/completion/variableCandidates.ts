// Pure builder for the shared `{{...}}` candidate list. It knows nothing about
// CodeMirror or React so it can be unit-tested in isolation and reused by any
// completion surface. The grammar it mirrors is the ONLY source of truth:
// `src-tauri/src/interp.rs` (the interpolation engine). Never invent a namespace
// or function the interpolator does not resolve.
//
// SECURITY INVARIANT: secrets surface by NAME only. A secret candidate's
// `detail`/`insert` must never carry the secret value — enforced by tests.

import type { MergedVar } from "../envMerge";

export type CandidateKind = "env" | "secret" | "dynamic" | "runvar";

export interface VarCandidate {
  /** Full token INCLUDING braces, e.g. "{{env.host}}", inserted verbatim. */
  insert: string;
  /** Namespaced label shown in the popup, e.g. "env.host", "$uuid". */
  label: string;
  kind: CandidateKind;
  /** Short EN detail line. NEVER a secret value. */
  detail: string;
  /** Sort weight — lower first. */
  boost: number;
  /** True when `insert` is a CodeMirror snippet template (arg tab-stops). */
  isSnippet: boolean;
}

/** i18n detail strings the builder needs, injected so the pure module stays
 *  dependency-free (no import of the translate layer). */
export interface CandidateStrings {
  secretDetail: string;
  dynamic: {
    uuid: string;
    timestamp: string;
    timestampMs: string;
    datetimeIso: string;
    randomInt: string;
    randomHex: string;
    base64: string;
  };
}

export interface CandidateSources {
  vars: MergedVar[];
  /** Optional {{var.NAME}} run-var namespace — omit when unavailable. */
  runVarNames?: string[];
  strings: CandidateStrings;
}

const BOOST_ENV = 0;
const BOOST_SECRET = -10;
const BOOST_DYNAMIC = -20;
const BOOST_RUNVAR = -5;

/** Static table mirroring `interp.rs::resolve_dynamic` / `resolve_dynamic_call`.
 *  A future Rust addition is a one-line diff here. `detailKey` maps into
 *  `CandidateStrings.dynamic`. Arg-taking calls carry CM snippet tab-stops. */
const DYNAMIC_FUNCTIONS: ReadonlyArray<{
  insert: string;
  label: string;
  detailKey: keyof CandidateStrings["dynamic"];
  isSnippet: boolean;
}> = [
  { insert: "{{$uuid}}", label: "$uuid", detailKey: "uuid", isSnippet: false },
  { insert: "{{$timestamp}}", label: "$timestamp", detailKey: "timestamp", isSnippet: false },
  { insert: "{{$timestamp_ms}}", label: "$timestamp_ms", detailKey: "timestampMs", isSnippet: false },
  { insert: "{{$datetime.iso}}", label: "$datetime.iso", detailKey: "datetimeIso", isSnippet: false },
  { insert: "{{$random.int(${1:0},${2:9})}}", label: "$random.int(a,b)", detailKey: "randomInt", isSnippet: true },
  { insert: "{{$random.hex(${1:16})}}", label: "$random.hex(n)", detailKey: "randomHex", isSnippet: true },
  { insert: "{{$base64(${1:text})}}", label: "$base64(text)", detailKey: "base64", isSnippet: true },
];

/**
 * Build the ordered, de-duplicated candidate list.
 *
 * Priority (composition order): env public vars → secret names → dynamic
 * functions → run-vars. Env public vars show their value in `detail` (public,
 * useful); secrets show the literal word "secret" and NEVER a value.
 */
export function buildVariableCandidates(src: CandidateSources): VarCandidate[] {
  const candidates: VarCandidate[] = [];

  for (const variable of src.vars) {
    if (variable.isSecret) continue;
    candidates.push({
      insert: `{{env.${variable.name}}}`,
      label: `env.${variable.name}`,
      kind: "env",
      detail: variable.value,
      boost: BOOST_ENV,
      isSnippet: false,
    });
  }

  for (const variable of src.vars) {
    if (!variable.isSecret) continue;
    // Read only `.name` for secrets — never copy `.value` into the payload,
    // even if a future/malicious store leaks a non-empty value on a secret row.
    candidates.push({
      insert: `{{secret.${variable.name}}}`,
      label: `secret.${variable.name}`,
      kind: "secret",
      detail: src.strings.secretDetail,
      boost: BOOST_SECRET,
      isSnippet: false,
    });
  }

  for (const fn of DYNAMIC_FUNCTIONS) {
    candidates.push({
      insert: fn.insert,
      label: fn.label,
      kind: "dynamic",
      detail: src.strings.dynamic[fn.detailKey],
      boost: BOOST_DYNAMIC,
      isSnippet: fn.isSnippet,
    });
  }

  if (src.runVarNames && src.runVarNames.length > 0) {
    for (const name of src.runVarNames) {
      candidates.push({
        insert: `{{var.${name}}}`,
        label: `var.${name}`,
        kind: "runvar",
        detail: "",
        boost: BOOST_RUNVAR,
        isSnippet: false,
      });
    }
  }

  return dedupeAndSort(candidates);
}

/** De-duplicate by `insert` (first wins) then sort by boost, then label. */
function dedupeAndSort(candidates: VarCandidate[]): VarCandidate[] {
  const seen = new Set<string>();
  const unique: VarCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.insert)) continue;
    seen.add(candidate.insert);
    unique.push(candidate);
  }
  return unique.sort(
    (a, b) => b.boost - a.boost || a.label.localeCompare(b.label),
  );
}
