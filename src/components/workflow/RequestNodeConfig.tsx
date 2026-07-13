import { useState } from "react";
import type { StoredRequest } from "../../lib/types";
import type { RequestSource, WorkflowNode } from "../../lib/workflow";
import { blankInlineRequest } from "../../lib/workflowNodes";
import { useCollectionsStore } from "../../state/useCollectionsStore";
import { MethodSelect } from "../workbench/MethodSelect";
import { UrlInput } from "../workbench/UrlInput";
import { BodyPanel } from "../workbench/BodyPanel";
import { QueryEditor } from "../graphql/QueryEditor";
import { VariablesPanel } from "../graphql/VariablesPanel";
import { WorkflowHeadersTable } from "./WorkflowHeadersTable";
import { useT } from "../../i18n/useT";

type RequestNode = Extract<WorkflowNode, { kind: "request" }>;

interface RequestNodeConfigProps {
  node: RequestNode;
  onChange: (node: WorkflowNode) => void;
}

/** Full request configuration for a workflow Request node. Two modes:
 *  - "saved": reference a request from a collection by id (dropdown).
 *  - "inline": edit method/url/headers/body ad-hoc, plus a GraphQL toggle that
 *    reuses the workbench GraphQL editor (query + variables). The inline form
 *    writes a full StoredRequest onto the node, which the Rust engine executes
 *    via the same path as a saved request. Validation flags a missing URL /
 *    unselected reference. */
export function RequestNodeConfig({ node, onChange }: RequestNodeConfigProps) {
  const t = useT();
  const requests = useCollectionsStore((state) => state.requests);
  const inline = "request" in node ? node.request : null;
  const [mode, setMode] = useState<"saved" | "inline">(inline ? "inline" : "saved");

  function setSource(source: RequestSource) {
    // Replace the source discriminant cleanly (drop the other arm's key).
    onChange({ kind: "request", id: node.id, position: node.position, ...source });
  }

  function switchMode(next: "saved" | "inline") {
    setMode(next);
    if (next === "inline" && !inline) {
      setSource({ request: blankInlineRequest(t("workflow.inlineRequestName")) });
    } else if (next === "saved" && inline) {
      setSource({ request_ref: "" });
    }
  }

  function patchInline(patch: Partial<StoredRequest>) {
    if (!inline) return;
    setSource({ request: { ...inline, ...patch } });
  }

  const isGraphql = inline?.graphql != null;

  return (
    <div className="lok-wf-request">
      <div className="lok-wf-modeswitch" role="group" aria-label={t("workflow.requestSourceAria")}>
        <button
          type="button"
          aria-pressed={mode === "saved"}
          className={mode === "saved" ? "on" : ""}
          onClick={() => switchMode("saved")}
        >
          {t("workflow.sourceSaved")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "inline"}
          className={mode === "inline" ? "on" : ""}
          onClick={() => switchMode("inline")}
        >
          {t("workflow.sourceInline")}
        </button>
      </div>

      {mode === "saved" && "request_ref" in node && (
        <label className="lok-wf-field">
          <span>{t("workflow.requestRef")}</span>
          <select
            value={node.request_ref}
            onChange={(e) => setSource({ request_ref: e.target.value })}
          >
            <option value="">{t("workflow.pickSavedRequest")}</option>
            {requests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.method} · {request.name}
              </option>
            ))}
          </select>
          {node.request_ref === "" && (
            <small className="lok-wf-error">{t("workflow.requestRefMissing")}</small>
          )}
        </label>
      )}

      {mode === "inline" && inline && (
        <div className="lok-wf-inline">
          <div className="lok-wf-reqbar">
            <MethodSelect
              method={inline.method}
              onChange={(method) => patchInline({ method })}
            />
            <UrlInput
              url={inline.url}
              onChange={(url) => patchInline({ url })}
              onEnter={() => undefined}
            />
          </div>
          {inline.url.trim() === "" && (
            <small className="lok-wf-error">{t("workflow.urlMissing")}</small>
          )}

          <label className="lok-wf-toggle">
            <input
              type="checkbox"
              checked={isGraphql}
              onChange={(e) =>
                patchInline({
                  graphql: e.target.checked
                    ? { operation_type: "query", query: "", variables_json: "{}" }
                    : null,
                })
              }
            />
            <span>{t("workflow.graphqlMode")}</span>
          </label>

          <div className="lok-wf-section">
            <span className="lok-wf-section-title">{t("workbench.headersPane")}</span>
            <WorkflowHeadersTable
              headers={inline.headers}
              onChange={(headers) => patchInline({ headers })}
            />
          </div>

          {isGraphql && inline.graphql ? (
            <>
              <div className="lok-wf-section">
                <span className="lok-wf-section-title">{t("graphql.queryEditorAria")}</span>
                <div className="lok-wf-query-editor">
                  <QueryEditor
                    query={inline.graphql.query}
                    schema={null}
                    onChange={(query) =>
                      patchInline({
                        graphql: { ...inline.graphql!, query },
                      })
                    }
                  />
                </div>
              </div>
              <div className="lok-wf-section">
                <span className="lok-wf-section-title">{t("graphql.variablesAria")}</span>
                <VariablesPanel
                  value={inline.graphql.variables_json}
                  onChange={(variables_json) =>
                    patchInline({
                      graphql: { ...inline.graphql!, variables_json },
                    })
                  }
                />
              </div>
            </>
          ) : (
            <div className="lok-wf-section">
              <span className="lok-wf-section-title">{t("workbench.bodyPane")}</span>
              <BodyPanel body={inline.body} onChange={(body) => patchInline({ body })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
