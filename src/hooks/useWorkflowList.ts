// Loads and manages the set of saved workflows shown in the sidebar's Workflows
// section: list on mount, select the active one, create a blank draft, delete.
// Persistence goes through the workflow_* IPC commands; the editor graph lives in
// useWorkflowGraph and re-seeds from the selected workflow.

import { useCallback, useEffect, useState } from "react";
import { workflowDelete, workflowList } from "../lib/ipc";
import type { Workflow } from "../lib/workflow";

export interface UseWorkflowList {
  workflows: Workflow[];
  selected: Workflow | null;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  createDraft: () => void;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  applySaved: (saved: Workflow) => void;
}

const BLANK: Workflow = { id: "", name: "Untitled workflow", nodes: [], edges: [] };

export function useWorkflowList(): UseWorkflowList {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await workflowList();
      setWorkflows(list);
      setError(null);
      // Keep the current selection if it still exists, else fall to first/blank.
      setSelected((current) => {
        if (current && list.some((w) => w.id === current.id)) return current;
        return list[0] ?? null;
      });
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback(
    (id: string) => {
      const match = workflows.find((w) => w.id === id);
      if (match) setSelected(match);
    },
    [workflows],
  );

  const createDraft = useCallback(() => {
    // A fresh unsaved draft; the editor seeds from it and Save persists it.
    setSelected({ ...BLANK });
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await workflowDelete(id);
      await refresh();
    },
    [refresh],
  );

  // After a Save mints/updates a workflow, reflect it in the list + selection.
  const applySaved = useCallback((saved: Workflow) => {
    setWorkflows((current) => {
      const exists = current.some((w) => w.id === saved.id);
      return exists
        ? current.map((w) => (w.id === saved.id ? saved : w))
        : [...current, saved];
    });
    setSelected(saved);
  }, []);

  return {
    workflows,
    selected,
    loading,
    error,
    select,
    createDraft,
    remove,
    refresh,
    applySaved,
  };
}
