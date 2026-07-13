// Pure interpolation + plural helpers for the zero-dependency i18n layer.
// Kept free of React/store imports so it is unit-testable in isolation.

import type { Locale } from "./index";

export type InterpolationVars = Record<string, string | number>;

/** Replace `{token}` placeholders in `template` with values from `vars`.
 *  Numeric values are formatted with the locale's grouping via Intl.NumberFormat
 *  so PL renders "1 000" where EN renders "1,000". Unknown tokens are left as-is. */
export function interpolate(
  template: string,
  vars: InterpolationVars | undefined,
  locale: Locale,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    const value = vars[key];
    return typeof value === "number"
      ? new Intl.NumberFormat(locale).format(value)
      : String(value);
  });
}

/** Minimal ICU-free plural selector using the built-in Intl.PluralRules. */
export function plural(
  locale: Locale,
  count: number,
  forms: { one: string; other: string; few?: string; many?: string },
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const chosen =
    (category === "few" && forms.few) ||
    (category === "many" && forms.many) ||
    (category === "one" && forms.one) ||
    forms.other;
  return interpolate(chosen, { count }, locale);
}
