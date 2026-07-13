import { useState } from "react";
import type { CompletionSource } from "@codemirror/autocomplete";
import { SingleLineCodeInput } from "../common/SingleLineCodeInput";
import type { GetCandidates } from "../../hooks/useVariableCandidates";
import { renderTokenPills } from "./renderTokenPills";

interface KeyValueValueCellProps {
  value: string;
  onChange: (value: string) => void;
  getCandidates: GetCandidates;
  ariaLabel: string;
  placeholder?: string;
  extraSources?: CompletionSource[];
}

/**
 * A value cell that renders a cheap highlighted span while idle and swaps to the
 * live single-line CodeMirror editor on focus. This keeps a many-row table from
 * mounting one editor per row: only the focused cell is a real editor.
 */
export function KeyValueValueCell({
  value,
  onChange,
  getCandidates,
  ariaLabel,
  placeholder,
  extraSources,
}: KeyValueValueCellProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SingleLineCodeInput
        className="kv-value-editor"
        value={value}
        onChange={onChange}
        getCandidates={getCandidates}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        extraSources={extraSources}
      />
    );
  }

  return (
    <button
      type="button"
      className="kv-value-display"
      aria-label={ariaLabel}
      onFocus={() => setEditing(true)}
      onClick={() => setEditing(true)}
    >
      {value ? renderTokenPills(value) : <span className="kv-value-placeholder">{placeholder}</span>}
    </button>
  );
}
