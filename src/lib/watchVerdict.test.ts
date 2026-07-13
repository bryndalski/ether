import { describe, expect, it } from "vitest";
import { watchVerdict } from "./watchVerdict";
import type { AssertionSummary } from "./assertions";

const allPass: AssertionSummary = {
  total: 2,
  passed: 2,
  failed: 0,
  skipped: 0,
  allPassed: true,
};
const someFail: AssertionSummary = { ...allPass, passed: 1, failed: 1, allPassed: false };

describe("watchVerdict", () => {
  it("is ok when status is 2xx, all assertions pass and snapshot is not fail", () => {
    expect(watchVerdict({ status: 200, assertions: allPass, snapshot: "pass" })).toBe(true);
  });

  it("is ok with no assertions and no snapshot", () => {
    expect(watchVerdict({ status: 204, assertions: null, snapshot: null })).toBe(true);
  });

  it("fails on a non-2xx status", () => {
    expect(watchVerdict({ status: 500, assertions: allPass, snapshot: "pass" })).toBe(false);
    expect(watchVerdict({ status: null, assertions: allPass, snapshot: "pass" })).toBe(false);
  });

  it("fails when an assertion fails", () => {
    expect(watchVerdict({ status: 200, assertions: someFail, snapshot: "pass" })).toBe(false);
  });

  it("fails when the snapshot fails", () => {
    expect(watchVerdict({ status: 200, assertions: allPass, snapshot: "fail" })).toBe(false);
  });

  it("tolerates a non-json snapshot verdict (not a fail)", () => {
    expect(watchVerdict({ status: 200, assertions: allPass, snapshot: "non-json" })).toBe(true);
  });
});
