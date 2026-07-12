import { create } from "zustand";
import type { RequestSpec } from "../lib/types";

/** Imperative bus so the shell-level palette can drive the workbench-local draft
 *  (Save / Send / Benchmark / Copy-as-cURL / import a cURL spec). The workbench
 *  registers its current callbacks; the palette invokes them. All draft logic
 *  stays inside the workbench — this store holds only thin handles. */
interface WorkbenchActions {
  save: (() => void) | null;
  send: (() => void) | null;
  benchmark: (() => void) | null;
  copyCurl: (() => void) | null;
  importSpec: ((spec: RequestSpec) => void) | null;
  canSave: boolean;
  canSend: boolean;

  register: (actions: Partial<WorkbenchActions>) => void;
  reset: () => void;
}

const EMPTY: Pick<
  WorkbenchActions,
  "save" | "send" | "benchmark" | "copyCurl" | "importSpec" | "canSave" | "canSend"
> = {
  save: null,
  send: null,
  benchmark: null,
  copyCurl: null,
  importSpec: null,
  canSave: false,
  canSend: false,
};

export const useWorkbenchActions = create<WorkbenchActions>((set) => ({
  ...EMPTY,
  register: (actions) => set(actions),
  reset: () => set(EMPTY),
}));
