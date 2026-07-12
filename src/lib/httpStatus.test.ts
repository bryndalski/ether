import { describe, expect, it } from "vitest";
import { statusClass, statusColorToken, statusText } from "./httpStatus";

describe("statusText", () => {
  it("maps known codes to reason phrases", () => {
    expect(statusText(200)).toBe("OK");
    expect(statusText(404)).toBe("Not Found");
    expect(statusText(500)).toBe("Internal Server Error");
  });

  it("falls back to a class label for unknown codes", () => {
    expect(statusText(299)).toBe("Success");
    expect(statusText(451)).toBe("Client Error");
    expect(statusText(0)).toBe("Unknown");
  });
});

describe("statusClass", () => {
  it("classifies by hundreds range", () => {
    expect(statusClass(200)).toBe("success");
    expect(statusClass(301)).toBe("info");
    expect(statusClass(404)).toBe("warn");
    expect(statusClass(500)).toBe("danger");
    expect(statusClass(100)).toBe("neutral");
    expect(statusClass(0)).toBe("neutral");
  });
});

describe("statusColorToken", () => {
  it("returns the matching design-system token", () => {
    expect(statusColorToken(200)).toBe("var(--lok-status-success)");
    expect(statusColorToken(404)).toBe("var(--lok-status-warn)");
    expect(statusColorToken(500)).toBe("var(--lok-status-danger)");
  });
});
