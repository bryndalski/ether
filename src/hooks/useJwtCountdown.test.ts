import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useJwtCountdown } from "./useJwtCountdown";

describe("useJwtCountdown", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks down once per second and reports a mm:ss label", () => {
    const exp = Math.floor(NOW / 1000) + 65; // 1:05 out (< 5 min → expiring-soon)
    const { result } = renderHook(() => useJwtCountdown({ exp }));

    expect(result.current.status).toBe("expiring-soon");
    expect(result.current.label).toBe("01:05");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.label).toBe("01:04");
  });

  it("reports a far-future exp as valid", () => {
    const exp = Math.floor(NOW / 1000) + 3600; // 1 h out
    const { result } = renderHook(() => useJwtCountdown({ exp }));
    expect(result.current.status).toBe("valid");
    expect(result.current.label).toBe("1h 00m");
  });

  it("flips to expired once the deadline passes", () => {
    const exp = Math.floor(NOW / 1000) + 2;
    const { result } = renderHook(() => useJwtCountdown({ exp }));
    expect(result.current.status).toBe("expiring-soon");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.status).toBe("expired");
  });

  it("clears the interval on unmount (no leaked timer)", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() =>
      useJwtCountdown({ exp: Math.floor(NOW / 1000) + 100 }),
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("reports no-exp with an em-dash label", () => {
    const { result } = renderHook(() => useJwtCountdown({ sub: "x" }));
    expect(result.current.status).toBe("no-exp");
    expect(result.current.label).toBe("—");
  });
});
