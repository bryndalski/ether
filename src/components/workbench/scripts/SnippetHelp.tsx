import { useT } from "../../../i18n/useT";

interface SnippetHelpProps {
  /** Which phase's snippets to show — pre-request or post-response. */
  phase: "pre" | "post";
  /** Insert a snippet at the caret / append it to the script. */
  onInsert: (snippet: string) => void;
}

// The documented `lok` surface, per phase. Keeping the list here (not guessed by
// the user) is the counter to reaching for a non-existent `require`/`fetch`.
const PRE_SNIPPETS: { code: string }[] = [
  { code: `lok.request.setHeader("X-Sig", "abc");` },
  { code: `lok.request.setUrl("https://api/v2");` },
  { code: `lok.env.set("token", "…");` },
  { code: `lok.env.get("token");` },
];

const POST_SNIPPETS: { code: string }[] = [
  { code: `lok.expect("2xx", lok.response.status < 300);` },
  { code: `const data = lok.response.json();` },
  { code: `lok.env.set("id", lok.extract("$.data.id"));` },
  { code: `lok.test("has token", () => { if (!lok.response.body) throw 0; });` },
];

/** A small inline list of copy-paste snippets documenting the `lok` surface. */
export function SnippetHelp({ phase, onInsert }: SnippetHelpProps) {
  const t = useT();
  const snippets = phase === "pre" ? PRE_SNIPPETS : POST_SNIPPETS;

  return (
    <div className="script-snippets" aria-label={t("scripts.snippetsAria")}>
      <span className="script-snippets-label">{t("scripts.snippets")}</span>
      <ul className="script-snippet-list">
        {snippets.map((snippet) => (
          <li key={snippet.code}>
            <button
              type="button"
              className="script-snippet"
              onClick={() => onInsert(snippet.code)}
              title={t("scripts.insertSnippet")}
            >
              <code>{snippet.code}</code>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
