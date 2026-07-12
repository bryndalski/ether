// A 1 Hz ticking countdown to a JWT's exp / nbf. Pure classification lives in
// jwt.ts; this hook only owns the clock. Reduced-motion never disables the tick
// (the value must keep updating) — only the CSS pulse is gated in the view.

import { useEffect, useState } from "react";
import { jwtExpiryStatus, type ExpiryStatus } from "../lib/jwt";
import { formatCountdown } from "../lib/format";

export interface CountdownState {
  status: ExpiryStatus;
  /** mm:ss / Xd Yh of the absolute delta to exp (or nbf when not-yet-valid). */
  label: string;
  deltaMs: number | null;
}

export function useJwtCountdown(
  payload: Record<string, unknown> | null,
): CountdownState {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [payload]);

  const { status, deltaMs } = jwtExpiryStatus(payload, nowMs);
  const label = deltaMs == null ? "—" : formatCountdown(deltaMs);
  return { status, label, deltaMs };
}
