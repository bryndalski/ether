import { useT } from "../../i18n/useT";

interface HtmlPreviewProps {
  html: string;
}

/** Renders an HTML response body in a fully-sandboxed iframe. `sandbox=""` with
 *  no `allow-*` tokens means NO scripts, forms, popups, same-origin access or
 *  top-navigation — a local API client must never execute a server's JS. The
 *  markup is passed via srcDoc (not a URL) so nothing is fetched or navigated. */
export function HtmlPreview({ html }: HtmlPreviewProps) {
  const t = useT();
  return (
    <iframe
      className="resp-html-preview"
      title={t("response.htmlPreviewTitle")}
      sandbox=""
      srcDoc={html}
    />
  );
}
