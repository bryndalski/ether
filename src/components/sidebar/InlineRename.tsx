import { useState } from "react";

interface InlineRenameProps {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** Controlled input swapped in for a row label during rename. Enter commits,
 *  Esc cancels, blur commits. */
export function InlineRename({ value, onCommit, onCancel }: InlineRenameProps) {
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (next === "" || next === value) onCancel();
    else onCommit(next);
  }

  return (
    <input
      className="tree-rename"
      aria-label="Zmień nazwę"
      autoFocus
      value={draft}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
