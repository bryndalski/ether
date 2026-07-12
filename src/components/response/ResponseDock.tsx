import { useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import type { SendState } from "../../hooks/useSendRequest";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "./StatusBadge";
import { ResponseMeta } from "./ResponseMeta";
import { ResponseBody } from "./ResponseBody";
import { ResponseHeaders } from "./ResponseHeaders";
import { TimelineWaterfall } from "./TimelineWaterfall";
import { VerboseLog } from "./VerboseLog";
import { ResponseTabs, type ResponseTabKey } from "./ResponseTabs";

interface ResponseDockProps {
  sendState: SendState;
}

function contentType(headers: { name: string; value: string }[]): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === "content-type")?.value;
}

/** Response dock (Zone 3). Empty until the first Send; then status + meta + tabs
 *  + the active tab body. Errors/cancels show a banner instead of a response. */
export function ResponseDock({ sendState }: ResponseDockProps) {
  const placement = useUiStore((state) => state.responsePlacement);
  const responseSize = useUiStore((state) => state.responseSize);
  const [tab, setTab] = useState<ResponseTabKey>("Body");

  const sizeStyle =
    placement === "bottom"
      ? { height: `${responseSize}%`, minHeight: 220 }
      : { width: "var(--lok-response-w, 42%)" };
  const borderStyle =
    placement === "bottom"
      ? { borderTop: "1px solid var(--lok-border-default)" }
      : { borderLeft: "1px solid var(--lok-border-default)" };

  const { phase, response, error } = sendState;

  if (phase === "idle" || phase === "interpolating" || phase === "in-flight") {
    return (
      <section
        aria-label="Odpowiedź"
        className="response"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        <div className="lok-scroll lok-selectable" style={{ flex: 1 }}>
          <EmptyState
            headline={
              phase === "in-flight"
                ? "Wysyłam request…"
                : "Naciśnij Send i zobacz waterfall"
            }
            hint="Odpowiedź, nagłówki i oś czasu pojawią się tutaj."
            shortcut="⌘↵"
            icon="~"
          />
        </div>
      </section>
    );
  }

  if (phase === "error" || phase === "canceled") {
    const isError = phase === "error";
    return (
      <section
        aria-label="Odpowiedź"
        className="response"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        <div className="resp-body">
          <div
            role={isError ? "alert" : undefined}
            aria-live="polite"
            style={{
              padding: "var(--lok-space-3) var(--lok-space-4)",
              borderRadius: "var(--lok-radius-sm)",
              color: isError
                ? "var(--lok-status-danger)"
                : "var(--lok-text-secondary)",
              background: isError
                ? "var(--lok-status-danger-bg)"
                : "var(--lok-bg-active)",
              fontFamily: "var(--lok-font-mono)",
              fontSize: "var(--lok-fs-sm)",
            }}
          >
            {isError ? error : "Request anulowany."}
          </div>
        </div>
      </section>
    );
  }

  // success
  if (!response) return null;
  const headerContentType = contentType(response.headers);

  function copyBody() {
    void navigator.clipboard?.writeText(response?.body ?? "");
  }

  return (
    <section
      aria-label="Odpowiedź"
      className="response"
      style={{ ...sizeStyle, ...borderStyle }}
    >
      <div className="resp-head">
        <StatusBadge status={response.status} httpVersion={response.http_version} />
        <ResponseMeta
          timings={response.timings}
          sizeBytes={response.size_download_bytes}
          tls={response.tls}
        />
      </div>
      <ResponseTabs
        active={tab}
        onSelect={setTab}
        headerCount={response.headers.length}
        onCopy={copyBody}
      />
      <div className="resp-body lok-scroll">
        {tab === "Body" && (
          <ResponseBody
            body={response.body}
            isBase64={response.body_is_base64}
            truncatedAt={response.body_truncated_at}
            contentType={headerContentType}
            sizeBytes={response.size_download_bytes}
          />
        )}
        {tab === "Headers" && <ResponseHeaders headers={response.headers} />}
        {tab === "Timeline" && <TimelineWaterfall timings={response.timings} />}
        {tab === "curl -v" && <VerboseLog verboseLog={response.verbose_log} />}
      </div>
    </section>
  );
}
