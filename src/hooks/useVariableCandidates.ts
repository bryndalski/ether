// Returns a STABLE getter over the live env store, so a CodeMirror editor (which
// mounts its extensions once) always reads current candidates on every trigger.
// The hook reads via useEnvStore.getState() inside the getter, and translates the
// i18n detail strings via useT so the candidate detail lines are localized.

import { useCallback } from "react";
import { useT } from "../i18n/useT";
import { useEnvStore } from "../state/useEnvStore";
import {
  buildVariableCandidates,
  type CandidateStrings,
  type VarCandidate,
} from "../lib/completion/variableCandidates";

/** Getter type consumed by variableAutocomplete. */
export type GetCandidates = () => VarCandidate[];

/**
 * Build a stable candidate getter. `runVarNames` is only supplied in a workflow
 * RequestNode editor; in the plain workbench it is omitted so `{{var.NAME}}` is
 * not suggested (it would resolve to nothing there).
 */
export function useVariableCandidates(runVarNames?: string[]): GetCandidates {
  const t = useT();
  return useCallback(() => {
    const strings: CandidateStrings = {
      secretDetail: t("autocomplete.secretDetail"),
      dynamic: {
        uuid: t("autocomplete.dynamicUuid"),
        timestamp: t("autocomplete.dynamicTimestamp"),
        timestampMs: t("autocomplete.dynamicTimestampMs"),
        datetimeIso: t("autocomplete.dynamicDatetimeIso"),
        randomInt: t("autocomplete.dynamicRandomInt"),
        randomHex: t("autocomplete.dynamicRandomHex"),
        base64: t("autocomplete.dynamicBase64"),
      },
    };
    return buildVariableCandidates({
      vars: useEnvStore.getState().mergedActiveVars(),
      runVarNames,
      strings,
    });
  }, [t, runVarNames]);
}
