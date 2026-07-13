import { afterEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useT } from "./useT";
import {
  DEFAULT_LOCALE,
  dictionaries,
  translate,
  type TKey,
} from "./index";
import { en } from "./en";
import { pl } from "./pl";
import { useUiStore } from "../state/useUiStore";

function resetLocale() {
  useUiStore.setState({ locale: DEFAULT_LOCALE });
}

afterEach(resetLocale);

describe("i18n default + switching", () => {
  it("defaults to English on a fresh store", () => {
    resetLocale();
    const { result } = renderHook(() => useT());
    expect(useUiStore.getState().locale).toBe("en");
    expect(result.current("workbench.send")).toBe("Send");
  });

  it("switches to Polish and rerenders consumers", () => {
    resetLocale();
    const { result } = renderHook(() => useT());
    act(() => useUiStore.getState().setLocale("pl"));
    expect(result.current("workbench.send")).toBe("Wyślij");
  });

  it("renders EN for several key screens by default", () => {
    resetLocale();
    const { result } = renderHook(() => useT());
    expect(result.current("palette.searchPlaceholder")).toBe(
      "Search requests, actions, env…",
    );
    expect(result.current("sidebar.emptyHeadline")).toBe(
      "Send your first request",
    );
    expect(result.current("response.emptyHint")).toBe(
      "Response, headers and timeline will appear here.",
    );
    expect(result.current("brand.name")).toBe("Ether");
  });
});

describe("missing-key fallback", () => {
  it("falls back from an absent locale value to the key string", () => {
    // A bogus key exists in neither locale → returns the key itself, never blank.
    const bogus = "workbench.doesNotExist" as unknown as TKey;
    expect(translate("pl", bogus)).toBe("workbench.doesNotExist");
    expect(translate("en", bogus)).toBe("workbench.doesNotExist");
  });

  it("keeps brand.name identical across locales (proper noun)", () => {
    expect(translate("en", "brand.name")).toBe("Ether");
    expect(translate("pl", "brand.name")).toBe("Ether");
  });
});

describe("interpolation through translate", () => {
  it("interpolates counts in EN and PL", () => {
    expect(
      translate("en", "import.done", { requests: 3, collections: 2 }),
    ).toBe("Imported 3 requests into 2 collections");
    expect(
      translate("pl", "import.done", { requests: 3, collections: 2 }),
    ).toBe("Zaimportowano 3 requestów do 2 kolekcji");
  });
});

describe("dictionary parity", () => {
  it("pl has exactly the same key set as en", () => {
    const flatten = (obj: object, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof value === "string"
          ? [path]
          : flatten(value as object, path);
      });
    expect(flatten(pl).sort()).toEqual(flatten(en).sort());
    // sanity: the registry exposes both locales.
    expect(Object.keys(dictionaries).sort()).toEqual(["en", "pl"]);
  });
});
