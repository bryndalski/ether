import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { humanBytes } from "../../lib/format";
import { useT } from "../../i18n/useT";

interface ResponseBodyProps {
  body: string;
  isBase64: boolean;
  truncatedAt: number | null;
  contentType?: string;
  sizeBytes: number;
}

const LARGE_BODY_BYTES = 200 * 1024;

const readOnlyTheme = EditorView.theme({
  "&": {
    fontSize: "var(--lok-fs-sm)",
    backgroundColor: "var(--lok-bg-code)",
    color: "var(--lok-text-primary)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--lok-bg-code)",
    border: "none",
    color: "var(--lok-text-disabled)",
  },
  ".cm-content": { fontFamily: "var(--lok-font-mono)" },
});

// Pretty-print JSON when it parses; otherwise show the raw text untouched.
function prettify(body: string, contentType?: string): { text: string; isJson: boolean } {
  const looksJson =
    contentType?.includes("json") ||
    body.trimStart().startsWith("{") ||
    body.trimStart().startsWith("[");
  if (!looksJson) return { text: body, isJson: false };
  try {
    return { text: JSON.stringify(JSON.parse(body), null, 2), isJson: true };
  } catch {
    return { text: body, isJson: false };
  }
}

/** Response body viewer: pretty JSON in a read-only CodeMirror, a binary
 *  affordance for base64 bodies, and a large-body guard behind "pokaż mimo to". */
export function ResponseBody({
  body,
  isBase64,
  truncatedAt,
  contentType,
  sizeBytes,
}: ResponseBodyProps) {
  const t = useT();
  const isLarge = sizeBytes > LARGE_BODY_BYTES;
  const [forceShow, setForceShow] = useState(false);
  const { text, isJson } = useMemo(
    () => prettify(body, contentType),
    [body, contentType],
  );
  const extensions = useMemo(
    () => (isJson ? [json(), readOnlyTheme] : [readOnlyTheme]),
    [isJson],
  );

  if (isBase64) {
    return (
      <div className="wb-label">
        {t("response.binaryBody", { size: humanBytes(sizeBytes) })}
      </div>
    );
  }

  if (isLarge && !forceShow) {
    return (
      <div className="lok-selectable" style={{ display: "grid", gap: 12 }}>
        <p className="wb-label" style={{ color: "var(--lok-status-warn)" }}>
          {t("response.largeBody", { size: humanBytes(sizeBytes) })}
        </p>
        <button
          type="button"
          className="btn-send"
          style={{ justifySelf: "start" }}
          onClick={() => setForceShow(true)}
        >
          {t("response.showAnyway")}
        </button>
      </div>
    );
  }

  return (
    <div className="lok-selectable">
      {truncatedAt != null && (
        <p className="wb-label" style={{ color: "var(--lok-status-warn)" }}>
          {t("response.truncatedPreview", { size: humanBytes(truncatedAt) })}
        </p>
      )}
      <CodeMirror
        value={text}
        theme="dark"
        editable={false}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
      />
    </div>
  );
}
