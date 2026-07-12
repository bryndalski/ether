import { describe, expect, it } from "vitest";
import { detectImportFormat } from "./importFormat";

describe("detectImportFormat", () => {
  it("detects Postman v2.1 via the schema url", () => {
    const json = JSON.stringify({
      info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/" },
      item: [],
    });
    expect(detectImportFormat(json)).toBe("postman");
  });

  it("detects Postman via info + item array without a schema url", () => {
    const json = JSON.stringify({ info: { name: "My API" }, item: [] });
    expect(detectImportFormat(json)).toBe("postman");
  });

  it("detects Insomnia v4 export", () => {
    const json = JSON.stringify({
      _type: "export",
      __export_format: 4,
      resources: [],
    });
    expect(detectImportFormat(json)).toBe("insomnia");
  });

  it("detects HAR by log.entries", () => {
    const json = JSON.stringify({ log: { version: "1.2", entries: [] } });
    expect(detectImportFormat(json)).toBe("har");
  });

  it("detects an .http file by its request line", () => {
    expect(detectImportFormat("GET https://api.test/users\n")).toBe("http");
    expect(detectImportFormat("# a comment\nPOST https://api.test/x")).toBe(
      "http",
    );
  });

  it("returns unknown for garbage", () => {
    expect(detectImportFormat("just some prose")).toBe("unknown");
    expect(detectImportFormat("")).toBe("unknown");
  });

  it("treats malformed JSON that looks like an .http file as http", () => {
    expect(detectImportFormat("DELETE https://api.test/{broken")).toBe("http");
  });

  it("returns unknown for a JSON object of an unrecognized shape", () => {
    expect(detectImportFormat(JSON.stringify({ hello: "world" }))).toBe(
      "unknown",
    );
  });
});
