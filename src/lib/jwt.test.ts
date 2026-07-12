import { describe, expect, it, vi } from "vitest";
import {
  decodeJwt,
  detectJwtCandidates,
  jwtExpiryStatus,
} from "./jwt";
import type { ResponseData } from "./types";

// Fixed, hand-crafted tokens (no real secret; signature segment is fake).
const HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const PAYLOAD =
  "eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWRhIiwiZXhwIjoyMDAwMDAwMDAwLCJpYXQiOjE2MDAwMDAwMDB9";
const TOKEN = `${HEADER}.${PAYLOAD}.sig-not-verified`;
const NONE_TOKEN = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJub25lLXVzZXIifQ.";

function response(overrides: Partial<ResponseData>): ResponseData {
  return {
    request_id: "r",
    status: 200,
    http_version: "HTTP/2",
    headers: [],
    body: "",
    body_is_base64: false,
    body_truncated_at: null,
    size_download_bytes: 0,
    timings: { dns_ms: 0, connect_ms: 0, tls_ms: 0, ttfb_ms: 0, total_ms: 0 },
    effective_url: "https://api/x",
    redirect_chain: [],
    verbose_log: "",
    tls: null,
    ...overrides,
  };
}

describe("decodeJwt", () => {
  it("decodes a known token without verifying the signature", () => {
    const decoded = decodeJwt(TOKEN);
    expect(decoded.valid).toBe(true);
    expect(decoded.error).toBeNull();
    expect(decoded.header?.alg).toBe("HS256");
    expect(decoded.payload?.sub).toBe("123");
    expect(decoded.payload?.name).toBe("Ada");
    // Signature captured verbatim, never checked.
    expect(decoded.signature).toBe("sig-not-verified");
  });

  it("accepts alg:none (empty signature segment)", () => {
    const decoded = decodeJwt(NONE_TOKEN);
    expect(decoded.valid).toBe(true);
    expect(decoded.header?.alg).toBe("none");
    expect(decoded.signature).toBe("");
  });

  it("returns an error (no throw) for a 2-segment string", () => {
    const decoded = decodeJwt("abc.def");
    expect(decoded.valid).toBe(false);
    expect(decoded.error).toBe("not a JWT");
  });

  it("returns an error for bad base64/JSON payload", () => {
    const decoded = decodeJwt(`${HEADER}.!!!not-base64!!!.sig`);
    expect(decoded.valid).toBe(false);
    expect(decoded.error).toBe("bad payload");
  });

  it("never calls console when decoding (token-leak guard)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    decodeJwt(TOKEN);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("detectJwtCandidates", () => {
  it("finds tokens in Authorization header, cookie, and body field", () => {
    const r = response({
      headers: [
        { name: "Authorization", value: `Bearer ${TOKEN}`, enabled: true },
        { name: "Set-Cookie", value: `sid=${TOKEN}; Path=/`, enabled: true },
        { name: "Content-Type", value: "application/json", enabled: true },
      ],
      body: JSON.stringify({ data: { accessToken: TOKEN } }),
    });
    const candidates = detectJwtCandidates(r);
    // Same token de-duplicated across sources → one entry, first source wins.
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].source).toBe("authorization");
    expect(candidates[0].label).toBe("Authorization header");
  });

  it("detects distinct tokens per source with correct labels", () => {
    const bodyToken = `${HEADER}.${PAYLOAD}.other`;
    const r = response({
      headers: [
        { name: "Set-Cookie", value: `session=${TOKEN}`, enabled: true },
        { name: "Content-Type", value: "application/json", enabled: true },
      ],
      body: JSON.stringify({ accessToken: bodyToken }),
    });
    const candidates = detectJwtCandidates(r);
    const labels = candidates.map((c) => c.label);
    expect(labels).toContain("Cookie session");
    expect(labels).toContain("body.accessToken");
  });

  it("returns [] when no token is present", () => {
    const r = response({
      headers: [{ name: "Content-Type", value: "text/plain", enabled: true }],
      body: "just some text",
    });
    expect(detectJwtCandidates(r)).toEqual([]);
  });
});

describe("jwtExpiryStatus", () => {
  const nowSec = 1_700_000_000;
  const nowMs = nowSec * 1000;

  it("classifies a far-future exp as valid", () => {
    expect(jwtExpiryStatus({ exp: nowSec + 3600 }, nowMs).status).toBe("valid");
  });

  it("classifies a near exp as expiring-soon", () => {
    expect(jwtExpiryStatus({ exp: nowSec + 120 }, nowMs).status).toBe(
      "expiring-soon",
    );
  });

  it("classifies a past exp as expired", () => {
    const result = jwtExpiryStatus({ exp: nowSec - 10 }, nowMs);
    expect(result.status).toBe("expired");
    expect(result.deltaMs).toBe(-10_000);
  });

  it("classifies a future nbf as not-yet-valid", () => {
    expect(jwtExpiryStatus({ nbf: nowSec + 100 }, nowMs).status).toBe(
      "not-yet-valid",
    );
  });

  it("classifies a missing exp as no-exp", () => {
    expect(jwtExpiryStatus({}, nowMs).status).toBe("no-exp");
  });
});
