import { describe, expect, it } from "vitest";
import { isHtmlBody } from "./htmlDetect";

describe("isHtmlBody", () => {
  it("is true for a text/html content-type", () => {
    expect(isHtmlBody("<h1>hi</h1>", "text/html; charset=utf-8")).toBe(true);
  });

  it("is true for application/xhtml+xml", () => {
    expect(isHtmlBody("<html></html>", "application/xhtml+xml")).toBe(true);
  });

  it("sniffs a doctype when the content-type is missing", () => {
    expect(isHtmlBody("<!DOCTYPE html><html><body>x</body></html>")).toBe(true);
  });

  it("sniffs a leading <html>/<head>/<!-- tag", () => {
    expect(isHtmlBody("  <html><head></head></html>")).toBe(true);
    expect(isHtmlBody("<!-- page --><body>x</body>")).toBe(true);
  });

  it("never flags JSON as HTML even with angle brackets in a value", () => {
    expect(isHtmlBody('{"markup":"<b>x</b>"}', "application/json")).toBe(false);
  });

  it("is false for plain text and unmarked non-HTML bodies", () => {
    expect(isHtmlBody("just some text", "text/plain")).toBe(false);
    expect(isHtmlBody("key: value")).toBe(false);
  });
});
