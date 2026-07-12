import { useState } from "react";

interface SdlFallbackPanelProps {
  sdlText: string;
  error: string | null;
  onApply: (sdl: string) => void;
}

/** Shown when introspection is disabled/errored: paste a schema in SDL. On
 *  apply, buildSchema yields the same GraphQLSchema the rest of the UI consumes.
 *  Parse errors are announced via aria-live. */
export function SdlFallbackPanel({ sdlText, error, onApply }: SdlFallbackPanelProps) {
  const [draft, setDraft] = useState(sdlText);

  return (
    <div className="sdl-fallback">
      <label htmlFor="sdl-input" style={{ fontSize: "var(--lok-fs-xs)", color: "var(--lok-text-secondary)" }}>
        Introspection unavailable — paste the schema (SDL) to explore it:
      </label>
      <textarea
        id="sdl-input"
        value={draft}
        spellCheck={false}
        placeholder={"type Query {\n  hello: String\n}"}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Schemat SDL"
      />
      {error && (
        <div className="err" role="alert" aria-live="polite">
          {error}
        </div>
      )}
      <button
        type="button"
        className="btn refresh"
        style={{ alignSelf: "flex-start" }}
        onClick={() => onApply(draft)}
        disabled={draft.trim() === ""}
      >
        Apply SDL
      </button>
    </div>
  );
}
