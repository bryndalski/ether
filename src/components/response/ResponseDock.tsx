import { useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useT } from "../../i18n/useT";
import type { SendState } from "../../hooks/useSendRequest";
import type { BenchConfig, BenchState } from "../../hooks/useBenchmark";
import type { UseWatchMode } from "../../hooks/useWatchMode";
import type {
  Assertion,
  ResponseData,
  ScrubConfig,
  SnapshotRecord,
} from "../../lib/types";
import { summarize, evalAssertions } from "../../lib/assertions";
import { relativeTimeLabel } from "../../lib/relativeTime";
import { detectJwtCandidates } from "../../lib/jwt";
import { EmptyState } from "../common/EmptyState";
import { StatusBadge } from "./StatusBadge";
import { ResponseMeta } from "./ResponseMeta";
import { ResponseBody } from "./ResponseBody";
import { ResponseHeaders } from "./ResponseHeaders";
import { TimelineWaterfall } from "./TimelineWaterfall";
import { VerboseLog } from "./VerboseLog";
import { ResponseTabs, type ResponseTabKey } from "./ResponseTabs";
import { AssertionResultsView } from "./tests/AssertionResultsView";
import { SnapshotView } from "./snapshot/SnapshotView";
import { WatchPanel } from "./watch/WatchPanel";
import { BenchmarkPanel } from "../devtools/BenchmarkPanel";
import { CertPanel } from "../devtools/CertPanel";
import { JwtPanel } from "../devtools/JwtPanel";

/** Testing surface for the live response: assertions, snapshot, watch. */
export interface TestingProps {
  assertions: Assertion[];
  snapshotRecord: SnapshotRecord | null;
  scrubConfig: ScrubConfig;
  watch: UseWatchMode;
  onSaveSnapshot: () => void;
  onAcceptSnapshot: () => void;
  onDeleteSnapshot: () => void;
}

/** A stored response opened read-only from History. When present, the dock
 *  renders these bytes instead of the live send lifecycle — no re-fetch. */
export interface ResponseSnapshot {
  response: ResponseData;
  source: "history";
  executedAt: string;
}

export interface DevToolsProps {
  benchState: BenchState;
  host: string;
  isProd: boolean;
  hasRedactedSecrets: boolean;
  insecure: boolean;
  onRunBenchmark: (config: BenchConfig) => void;
  onCancelBenchmark: () => void;
  onSelectSample: (index: number) => void;
}

interface ResponseDockProps {
  sendState: SendState;
  snapshot?: ResponseSnapshot | null;
  devTools?: DevToolsProps;
  testing?: TestingProps;
}

function contentType(headers: { name: string; value: string }[]): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === "content-type")?.value;
}

/** Response dock (Zone 3). Empty until the first Send; then status + meta + tabs
 *  + the active tab body. Errors/cancels show a banner instead of a response. */
export function ResponseDock({ sendState, snapshot, devTools, testing }: ResponseDockProps) {
  const placement = useUiStore((state) => state.responsePlacement);
  const responseSize = useUiStore((state) => state.responseSize);
  const t = useT();
  const [tab, setTab] = useState<ResponseTabKey>("Body");

  const sizeStyle =
    placement === "bottom"
      ? { height: `${responseSize}%`, minHeight: 220 }
      : { width: "var(--lok-response-w, 42%)" };
  const borderStyle =
    placement === "bottom"
      ? { borderTop: "1px solid var(--lok-border-default)" }
      : { borderLeft: "1px solid var(--lok-border-default)" };

  // Snapshot mode: render stored bytes read-only, ignoring the live sendState.
  // Benchmark is live-only, so a snapshot never gets a Bench tab.
  if (snapshot) {
    return renderResponse(
      t,
      snapshot.response,
      tab,
      setTab,
      sizeStyle,
      borderStyle,
      snapshot.executedAt,
      undefined,
      undefined,
    );
  }

  const { phase, response, error } = sendState;

  if (phase === "idle" || phase === "interpolating" || phase === "in-flight") {
    return (
      <section
        aria-label={t("response.title")}
        className="response"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        <div className="lok-scroll lok-selectable" style={{ flex: 1 }}>
          <EmptyState
            headline={
              phase === "in-flight"
                ? t("response.sending")
                : t("response.pressSend")
            }
            hint={t("response.emptyHint")}
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
        aria-label={t("response.title")}
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
            {isError ? error : t("response.canceled")}
          </div>
        </div>
      </section>
    );
  }

  // success
  if (!response) return null;
  return renderResponse(
    t,
    response,
    tab,
    setTab,
    sizeStyle,
    borderStyle,
    null,
    devTools,
    testing,
  );
}

/** Shared response view — used both live (on send success) and read-only from a
 *  History snapshot. When `executedAt` is set a "History · {when}" ribbon marks
 *  the response as a stored snapshot, not a live one. */
function renderResponse(
  t: ReturnType<typeof useT>,
  response: ResponseData,
  tab: ResponseTabKey,
  setTab: (tab: ResponseTabKey) => void,
  sizeStyle: React.CSSProperties,
  borderStyle: React.CSSProperties,
  executedAt: string | null,
  devTools: DevToolsProps | undefined,
  testing: TestingProps | undefined,
) {
  const headerContentType = contentType(response.headers);
  function copyBody() {
    void navigator.clipboard?.writeText(response.body ?? "");
  }

  const jwtCandidates = detectJwtCandidates(response);
  const showCert = response.tls != null;
  // Bench tab is available on any live response (it hosts the warned launcher).
  const showBench = devTools != null;

  const assertions = testing?.assertions ?? [];
  const assertionSummary =
    assertions.length > 0
      ? (() => {
          const s = summarize(evalAssertions(response, assertions));
          return `${s.passed}/${s.total}`;
        })()
      : null;
  const showSnapshot = testing != null;
  const showWatch = testing != null;

  return (
    <section
      aria-label={t("response.title")}
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
        {executedAt && (
          <span
            className="lok-tnums"
            style={{
              marginLeft: "auto",
              padding: "2px var(--lok-space-2)",
              borderRadius: "var(--lok-radius-full)",
              background: "var(--lok-bg-active)",
              color: "var(--lok-text-tertiary)",
              fontSize: "var(--lok-fs-2xs)",
            }}
            title={executedAt}
          >
            {t("history.snapshotRibbon", { when: relativeTimeLabel(executedAt) })}
          </span>
        )}
      </div>
      <ResponseTabs
        active={tab}
        onSelect={setTab}
        headerCount={response.headers.length}
        onCopy={copyBody}
        showBench={showBench}
        showCert={showCert}
        jwtCount={jwtCandidates.length}
        assertionSummary={assertionSummary}
        showSnapshot={showSnapshot}
        showWatch={showWatch}
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
        {tab === "Tests" && assertionSummary !== null && (
          <AssertionResultsView response={response} assertions={assertions} />
        )}
        {tab === "Snapshot" && testing && (
          <SnapshotView
            response={response}
            record={testing.snapshotRecord}
            scrubConfig={testing.scrubConfig}
            onSave={testing.onSaveSnapshot}
            onAccept={testing.onAcceptSnapshot}
            onDelete={testing.onDeleteSnapshot}
          />
        )}
        {tab === "Watch" && testing && <WatchPanel watch={testing.watch} />}
        {tab === "Bench" && showBench && devTools && (
          <BenchmarkPanel
            benchState={devTools.benchState}
            host={devTools.host}
            isProd={devTools.isProd}
            hasRedactedSecrets={devTools.hasRedactedSecrets}
            onRun={devTools.onRunBenchmark}
            onCancel={devTools.onCancelBenchmark}
            onSelectSample={devTools.onSelectSample}
          />
        )}
        {tab === "Cert" && response.tls && (
          <CertPanel
            tls={response.tls}
            insecure={devTools?.insecure ?? false}
          />
        )}
        {tab === "JWT" && jwtCandidates.length > 0 && (
          <JwtPanel candidates={jwtCandidates} />
        )}
      </div>
    </section>
  );
}
