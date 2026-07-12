import type { MultipartPart } from "../../lib/types";
import { Icon } from "../common/Icon";

interface MultipartTableProps {
  parts: MultipartPart[];
  onChange: (parts: MultipartPart[]) => void;
}

const EMPTY_TEXT: MultipartPart = { kind: "text", name: "", value: "" };

/** Multipart parts grid (text parts; file parts show their path read-only —
 *  the file picker is a later milestone). Controlled by useRequestDraft. */
export function MultipartTable({ parts, onChange }: MultipartTableProps) {
  const displayParts = [...parts, EMPTY_TEXT];

  function patchTextPart(index: number, patch: Partial<{ name: string; value: string }>) {
    if (index === parts.length) {
      onChange([...parts, { ...EMPTY_TEXT, ...patch }]);
      return;
    }
    const next = parts.map((part, i) => {
      if (i !== index || part.kind !== "text") return part;
      return { ...part, ...patch };
    });
    onChange(next);
  }

  function removePart(index: number) {
    onChange(parts.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="kv-head">
        <span />
        <span>Field</span>
        <span>Value / File</span>
        <span />
      </div>
      {displayParts.map((part, index) => {
        const isGhost = index === parts.length;
        const isFile = part.kind === "file";
        return (
          <div className="kv" key={index}>
            <span />
            <input
              type="text"
              className="k"
              value={part.name}
              placeholder="Field"
              aria-label={`Pole ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) =>
                patchTextPart(index, { name: event.target.value })
              }
              readOnly={isFile}
            />
            <input
              type="text"
              value={isFile ? part.path : part.value}
              placeholder="Value"
              aria-label={`Wartość ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) =>
                patchTextPart(index, { value: event.target.value })
              }
              readOnly={isFile}
            />
            {isGhost ? (
              <span />
            ) : (
              <button
                type="button"
                className="rm"
                aria-label={`Usuń ${part.name || "część"}`}
                onClick={() => removePart(index)}
              >
                <Icon name="i-x" size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
