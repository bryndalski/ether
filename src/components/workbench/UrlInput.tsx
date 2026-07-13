import { useT } from "../../i18n/useT";

interface UrlInputProps {
  url: string;
  onChange: (url: string) => void;
  onEnter: () => void;
}

/** Monospace URL field. Enter submits (sends the request). Inline {{var}}
 *  coloring is a nice-to-have deferred to a future overlay-highlight helper;
 *  v1 is a plain accessible input. */
export function UrlInput({ url, onChange, onEnter }: UrlInputProps) {
  const t = useT();
  return (
    <input
      type="text"
      className="url-field"
      aria-label={t("workbench.urlAria")}
      placeholder="https://api.example.com/{{env.host}}/users"
      value={url}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
