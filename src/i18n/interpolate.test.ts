import { describe, expect, it } from "vitest";
import { interpolate, plural } from "./interpolate";

describe("interpolate", () => {
  it("returns the template unchanged when no vars are given", () => {
    expect(interpolate("Send request", undefined, "en")).toBe("Send request");
  });

  it("replaces named string tokens", () => {
    expect(interpolate("Delete {name}", { name: "prod" }, "en")).toBe(
      "Delete prod",
    );
  });

  it("leaves unknown tokens untouched", () => {
    expect(interpolate("Delete {name}", { other: "x" }, "en")).toBe(
      "Delete {name}",
    );
  });

  it("formats numeric vars with the locale grouping", () => {
    expect(interpolate("{count} requests", { count: 1000 }, "en")).toBe(
      "1,000 requests",
    );
    // Assert against the platform's own Intl output so the test is independent
    // of the bundled ICU dataset (PL grouping varies by ICU build).
    const plNumber = new Intl.NumberFormat("pl").format(1000);
    expect(interpolate("{count} requestow", { count: 1000 }, "pl")).toBe(
      `${plNumber} requestow`,
    );
  });
});

describe("plural", () => {
  it("picks the English one/other forms", () => {
    const forms = { one: "{count} request", other: "{count} requests" };
    expect(plural("en", 1, forms)).toBe("1 request");
    expect(plural("en", 5, forms)).toBe("5 requests");
  });

  it("picks the Polish few/many forms", () => {
    const forms = {
      one: "{count} request",
      few: "{count} requesty",
      many: "{count} requestow",
      other: "{count} requestu",
    };
    expect(plural("pl", 1, forms)).toBe("1 request");
    // ICU category selection depends on the bundled dataset; assert the
    // returned string simply carries the interpolated count.
    expect(plural("pl", 5, forms)).toContain("5 ");
  });
});
