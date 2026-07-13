// useT() — the component-facing translation hook. Subscribes to the active
// locale in the UI store so a language switch rerenders every consumer, and
// returns a stable `t(key, vars)` bound to that locale.

import { useCallback } from "react";
import { useUiStore } from "../state/useUiStore";
import { translate, type Locale, type TKey } from "./index";
import type { InterpolationVars } from "./interpolate";

export type TranslateFn = (key: TKey, vars?: InterpolationVars) => string;

export function useT(): TranslateFn {
  const locale = useUiStore((state) => state.locale);
  return useCallback(
    (key: TKey, vars?: InterpolationVars) => translate(locale, key, vars),
    [locale],
  );
}

/** Non-hook accessor for the current locale (e.g. inside store actions/tests). */
export function currentLocale(): Locale {
  return useUiStore.getState().locale;
}
