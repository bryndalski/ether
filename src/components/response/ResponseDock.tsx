import { useCallback, useEffect, useRef, useState } from "react";
import { useUiStore } from "../../state/useUiStore";
import { useT } from "../../i18n/useT";
import { ResizeHandle } from "../common/ResizeHandle";
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
import { saveBodyToFile } from "../../lib/ipc";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
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
  /** The active request method, shown in the idle "Ready" strip. */
  method?: string;
}

function contentType(headers: { name: string; value: string }[]): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === "content-type")?.value;
}

/** Save-dialog default name keyed off the response's content type. */
function suggestedFilename(mime: string | undefined): string {
  const kind = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (kind.includes("json")) return "response.json";
  if (kind.includes("html")) return "response.html";
  if (kind.includes("xml")) return "response.xml";
  if (kind.startsWith("text/csv")) return "response.csv";
  if (kind.startsWith("text/")) return "response.txt";
  if (kind.startsWith("image/")) return `response.${kind.split("/")[1] || "bin"}`;
  if (kind === "application/pdf") return "response.pdf";
  return "response.bin";
}

/** Response dock (Zone 3). Empty until the first Send; then status + meta + tabs
 *  + the active tab body. Errors/cancels show a banner instead of a response. */
export function ResponseDock({ sendState, snapshot, devTools, testing, method }: ResponseDockProps) {
  const placement = useUiStore((state) => state.responsePlacement);
  const responseSize = useUiStore((state) => state.responseSize);
  const responseWidth = useUiStore((state) => state.responseWidth);
  const setResponseSize = useUiStore((state) => state.setResponseSize);
  const setResponseWidth = useUiStore((state) => state.setResponseWidth);
  const resetResponseSize = useUiStore((state) => state.resetResponseSize);
  const resetResponseWidth = useUiStore((state) => state.resetResponseWidth);
  const responseSeen = useUiStore((state) => state.responseSeen);
  const markResponseSeen = useUiStore((state) => state.markResponseSeen);
  const t = useT();

  // Once any response (or error) has ever arrived, remember it so the idle dock
  // stays the full split. Before that, idle = a thin strip.
  useEffect(() => {
    if (
      sendState.phase === "success" ||
      sendState.phase === "error" ||
      snapshot != null
    ) {
      markResponseSeen();
    }
  }, [sendState.phase, snapshot, markResponseSeen]);
  const [tab, setTab] = useState<ResponseTabKey>("Body");
  const sectionRef = useRef<HTMLElement>(null);

  const isBottom = placement === "bottom";
  const sizeStyle = isBottom
    ? { height: `${responseSize}%`, minHeight: 220 }
    : { width: responseWidth, flexShrink: 0 };
  const borderStyle = isBottom
    ? { borderTop: "1px solid var(--lok-border-default)" }
    : { borderLeft: "1px solid var(--lok-border-default)" };

  // Bottom dock grows as its top edge is dragged UP (delta<0 => taller): convert
  // the pixel delta to a percent of the editor column so both stay in the same
  // unit the CSS reads. Right dock grows as its left edge is dragged LEFT.
  const onDragBottom = useCallback(
    (start: number, deltaPx: number) => {
      const editorHeight = sectionRef.current?.parentElement?.clientHeight ?? 1;
      return start - (deltaPx / editorHeight) * 100;
    },
    [],
  );
  const onDragRight = useCallback(
    (start: number, deltaPx: number) => start - deltaPx,
    [],
  );

  const resizeHandle = (
    <ResizeHandle
      axis={isBottom ? "y" : "x"}
      value={isBottom ? responseSize : responseWidth}
      toValue={isBottom ? onDragBottom : onDragRight}
      onChange={isBottom ? setResponseSize : setResponseWidth}
      onReset={isBottom ? resetResponseSize : resetResponseWidth}
      ariaLabel={t("common.resizeResponse")}
    />
  );

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
      resizeHandle,
      sectionRef,
    );
  }

  const { phase, response, error } = sendState;

  const isInFlight = phase === "in-flight";
  const isIdlePhase =
    phase === "idle" || phase === "interpolating" || isInFlight;

  // Before the first-ever response, an idle/interpolating dock is a thin 44px
  // "Ready" strip so the request editor owns the screen (Postman-style). An
  // in-flight send always expands into the full dock (there's live progress to
  // show), and once a response has ever been seen the dock stays the full split.
  if (isIdlePhase && !responseSeen && !isInFlight) {
    return (
      <section
        aria-label={t("response.title")}
        className="response resp-idle-strip"
        style={borderStyle}
      >
        <span className="resp-idle-dot" aria-hidden />
        <span className="resp-idle-status">{t("response.ready")}</span>
        <span className="resp-idle-meta">
          {t("response.idleStrip", { method: method ?? "GET" })}
        </span>
        <span className="resp-idle-hint">
          {t("response.sendToSee")}
          <kbd className="lok-mono">⌘↵</kbd>
        </span>
      </section>
    );
  }

  if (isIdlePhase) {
    return (
      <section
        ref={sectionRef}
        aria-label={t("response.title")}
        className="response response--resizable"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        {resizeHandle}
        <div className="lok-scroll lok-selectable" style={{ flex: 1 }}>
          <EmptyState
            glow
            headline={
              isInFlight ? t("response.sending") : t("response.pressSend")
            }
            hint={t("response.emptyHint")}
            shortcut="⌘↵"
            icon={<Icon name="i-send" size={28} />}
          />
        </div>
      </section>
    );
  }

  if (phase === "error" || phase === "canceled") {
    const isError = phase === "error";
    return (
      <section
        ref={sectionRef}
        aria-label={t("response.title")}
        className="response response--resizable"
        style={{ ...sizeStyle, ...borderStyle }}
      >
        {resizeHandle}
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
    resizeHandle,
    sectionRef,
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
  resizeHandle: React.ReactNode,
  sectionRef: React.RefObject<HTMLElement | null>,
) {
  const headerContentType = contentType(response.headers);
  function copyBody() {
    void navigator.clipboard?.writeText(response.body ?? "");
  }
  function saveBody() {
    void (async () => {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: suggestedFilename(headerContentType),
      });
      if (path) {
        await saveBodyToFile(path, response.body ?? "", response.body_is_base64);
      }
    })();
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
      ref={sectionRef}
      aria-label={t("response.title")}
      className="response response--resizable"
      style={{ ...sizeStyle, ...borderStyle }}
    >
      {resizeHandle}
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
        onSaveFile={saveBody}
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
