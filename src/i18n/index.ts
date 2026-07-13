// Locale registry + typed key resolution for the dependency-free i18n layer.
// `en` is the source of truth and default; `pl` mirrors its shape (compile-time
// enforced via `pl: Dict`). The `t()` call site is deliberately i18next-shaped
// so a future swap to react-i18next stays a localized change.

import { en, type Dict } from "./en";
import { pl } from "./pl";
import { interpolate, type InterpolationVars } from "./interpolate";

export type { Dict } from "./en";
export type Locale = "en" | "pl";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALES: readonly Locale[] = ["en", "pl"];

export const dictionaries: Record<Locale, Dict> = { en, pl };

/** Dotted key paths into the (uniform-shaped) dictionary, e.g. "workbench.send". */
type Leaves<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: Leaves<T[K]> extends ""
        ? K
        : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

export type TKey = Leaves<Dict>;

/** Resolve a dotted key against a dictionary; returns the leaf string or
 *  undefined if the path is missing (defensive — typing should prevent it). */
function resolve(dict: Dict, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dict,
    );
  return typeof value === "string" ? value : undefined;
}

/** Translate `key` in `locale`, interpolating `vars`. Missing-key contract:
 *  active locale → English fallback → the raw key string. Never blank. */
export function translate(
  locale: Locale,
  key: string,
  vars?: InterpolationVars,
): string {
  const template =
    resolve(dictionaries[locale], key) ??
    resolve(dictionaries[DEFAULT_LOCALE], key) ??
    key;
  return interpolate(template, vars, locale);
}
