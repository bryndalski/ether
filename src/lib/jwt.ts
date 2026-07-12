// Pure JWT decoding — header + payload only, NO signature verification, NO
// network, NO logging, NO persistence. This is a decoder, not a validator.
// The signature segment is captured verbatim but never checked. Every function
// returns errors instead of throwing so detection can scan freely.

import type { ResponseData } from "./types";

export type JwtSource = "authorization" | "cookie" | "body" | "scan";

export interface JwtCandidate {
  source: JwtSource;
  token: string;
  label: string;
}

export interface DecodedJwt {
  raw: string;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  /** Raw base64url 3rd segment — captured, NEVER verified. */
  signature: string;
  /** Structurally decodable (NOT signature-valid). */
  valid: boolean;
  error: string | null;
}

export type ExpiryStatus =
  | "valid"
  | "expiring-soon"
  | "expired"
  | "not-yet-valid"
  | "no-exp";

export interface ExpiryResult {
  status: ExpiryStatus;
  expMs: number | null;
  nbfMs: number | null;
  deltaMs: number | null;
}

/** A JWT is three base64url segments; the third (signature) may be empty for
 *  alg:none. Anchored with word boundaries for the last-resort scan. */
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g;
const JWT_SHAPE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** base64url → UTF-8 JSON object, or null on any decode/parse failure. */
function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Decode a JWT header + payload without verifying the signature. */
export function decodeJwt(token: string): DecodedJwt {
  const raw = token.trim();
  const segments = raw.split(".");
  if (segments.length !== 3) {
    return {
      raw,
      header: null,
      payload: null,
      signature: "",
      valid: false,
      error: "not a JWT",
    };
  }
  const [headerSeg, payloadSeg, signature] = segments;
  const header = decodeSegment(headerSeg);
  const payload = decodeSegment(payloadSeg);
  if (header === null) {
    return { raw, header, payload, signature, valid: false, error: "bad header" };
  }
  if (payload === null) {
    return {
      raw,
      header,
      payload,
      signature,
      valid: false,
      error: "bad payload",
    };
  }
  return { raw, header, payload, signature, valid: true, error: null };
}

/** True when a string is shaped like a JWT AND its header decodes to JSON. */
function looksLikeJwt(value: string): boolean {
  if (!JWT_SHAPE.test(value)) return false;
  return decodeSegment(value.split(".")[0]) !== null;
}

function dedupe(candidates: JwtCandidate[]): JwtCandidate[] {
  const seen = new Set<string>();
  const out: JwtCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.token)) continue;
    seen.add(candidate.token);
    out.push(candidate);
  }
  return out;
}

function headerJson(response: ResponseData): boolean {
  const contentType = response.headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  return contentType != null && /json/i.test(contentType);
}

/** Walk parsed body JSON collecting token-ish string leaves. */
function walkBodyTokens(
  value: unknown,
  path: string,
  out: JwtCandidate[],
): void {
  if (typeof value === "string") {
    const keyIsTokenish = /token|jwt|access|id_token|refresh/i.test(path);
    if (keyIsTokenish && looksLikeJwt(value)) {
      out.push({ source: "body", token: value, label: `body.${path}` });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkBodyTokens(item, `${path}[${index}]`, out),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkBodyTokens(child, path ? `${path}.${key}` : key, out);
    }
  }
}

/** Detect JWT candidates already present in a response. Never throws. */
export function detectJwtCandidates(response: ResponseData): JwtCandidate[] {
  const candidates: JwtCandidate[] = [];

  for (const header of response.headers) {
    const name = header.name.toLowerCase();
    if (name === "authorization") {
      const token = header.value.replace(/^Bearer\s+/i, "").trim();
      if (looksLikeJwt(token)) {
        candidates.push({
          source: "authorization",
          token,
          label: "Authorization header",
        });
      }
    } else if (name === "set-cookie") {
      const match = header.value.match(/^([^=]+)=([^;]+)/);
      if (match && looksLikeJwt(match[2])) {
        candidates.push({
          source: "cookie",
          token: match[2],
          label: `Cookie ${match[1].trim()}`,
        });
      }
    }
  }

  if (!response.body_is_base64 && headerJson(response)) {
    try {
      walkBodyTokens(JSON.parse(response.body), "", candidates);
    } catch {
      // Not valid JSON — the scan below still runs.
    }
  }

  // Last-resort substring scan of headers + body.
  const haystack = `${response.headers
    .map((header) => header.value)
    .join(" ")} ${response.body}`;
  const scanned = haystack.match(JWT_REGEX) ?? [];
  for (const token of scanned) {
    if (looksLikeJwt(token)) {
      candidates.push({ source: "scan", token, label: "wykryty token" });
    }
  }

  return dedupe(candidates);
}

/** Classify a payload's expiry state. expiring-soon = < 5 min to exp. */
export function jwtExpiryStatus(
  payload: Record<string, unknown> | null,
  nowMs: number,
): ExpiryResult {
  const expSec = typeof payload?.exp === "number" ? payload.exp : null;
  const nbfSec = typeof payload?.nbf === "number" ? payload.nbf : null;
  const expMs = expSec != null ? expSec * 1000 : null;
  const nbfMs = nbfSec != null ? nbfSec * 1000 : null;
  const EXPIRING_SOON_MS = 300_000; // 5 minutes

  if (nbfMs != null && nowMs < nbfMs) {
    return {
      status: "not-yet-valid",
      expMs,
      nbfMs,
      deltaMs: nbfMs - nowMs,
    };
  }
  if (expMs == null) {
    return { status: "no-exp", expMs: null, nbfMs, deltaMs: null };
  }
  const deltaMs = expMs - nowMs;
  if (deltaMs <= 0) {
    return { status: "expired", expMs, nbfMs, deltaMs };
  }
  if (deltaMs < EXPIRING_SOON_MS) {
    return { status: "expiring-soon", expMs, nbfMs, deltaMs };
  }
  return { status: "valid", expMs, nbfMs, deltaMs };
}
