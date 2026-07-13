import { useT } from "../../i18n/useT";
import type { ConditionExpr, WorkflowNode } from "../../lib/workflow";
import { RequestNodeConfig } from "./RequestNodeConfig";

/** Right-rail editor for the selected node's fields. Emits a whole updated node
 *  (immutable) so the graph hook can swap it in; the container owns persistence.
 *  Single responsibility: render the correct form for the node kind. */
export function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: WorkflowNode | null;
  onChange: (node: WorkflowNode) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();

  if (!node) {
    return (
      <div className="lok-wf-inspector" aria-label={t("workflow.inspectorTitle")}>
        <p className="lok-wf-inspector__empty">{t("workflow.inspectorEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="lok-wf-inspector" aria-label={t("workflow.inspectorTitle")}>
      <div className="lok-wf-inspector__head">
        <h2 className="lok-wf-inspector__title">{t("workflow.inspectorTitle")}</h2>
        <button
          type="button"
          className="lok-wf-inspector__delete"
          onClick={() => onDelete(node.id)}
        >
          {t("workflow.deleteNode")}
        </button>
      </div>

      {node.kind === "request" && (
        <RequestNodeConfig node={node} onChange={onChange} />
      )}

      {node.kind === "extract" && (
        <>
          <label className="lok-wf-field">
            <span>{t("workflow.extractSource")}</span>
            <input
              type="text"
              value={node.source}
              onChange={(e) => onChange({ ...node, source: e.target.value })}
            />
          </label>
          <label className="lok-wf-field">
            <span>{t("workflow.extractVar")}</span>
            <input
              type="text"
              value={node.var_name}
              onChange={(e) => onChange({ ...node, var_name: e.target.value })}
            />
            <small>{t("workflow.extractVarHint")}</small>
          </label>
        </>
      )}

      {node.kind === "condition" && (
        <ConditionFields
          expr={node.expr}
          onChange={(expr) => onChange({ ...node, expr })}
        />
      )}

      {node.kind === "delay" && (
        <label className="lok-wf-field">
          <span>{t("workflow.delayMs")}</span>
          <input
            type="number"
            min={0}
            value={node.ms}
            onChange={(e) =>
              onChange({ ...node, ms: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
      )}
    </div>
  );
}

/** The condition sub-form — its own small component so the switch over expr types
 *  does not bloat the inspector. */
function ConditionFields({
  expr,
  onChange,
}: {
  expr: ConditionExpr;
  onChange: (expr: ConditionExpr) => void;
}) {
  const t = useT();

  const retype = (type: ConditionExpr["type"]): ConditionExpr => {
    switch (type) {
      case "status_equals":
        return { type, expected: 200 };
      case "status_in_range":
        return { type, min: 200, max: 299 };
      case "json_path_exists":
        return { type, path: "$." };
      case "json_path_equals":
        return { type, path: "$.", expected: "" };
    }
  };

  return (
    <>
      <label className="lok-wf-field">
        <span>{t("workflow.conditionType")}</span>
        <select
          value={expr.type}
          onChange={(e) => onChange(retype(e.target.value as ConditionExpr["type"]))}
        >
          <option value="status_equals">{t("workflow.conditionStatusEquals")}</option>
          <option value="status_in_range">{t("workflow.conditionStatusInRange")}</option>
          <option value="json_path_exists">{t("workflow.conditionPathExists")}</option>
          <option value="json_path_equals">{t("workflow.conditionPathEquals")}</option>
        </select>
      </label>

      {expr.type === "status_equals" && (
        <label className="lok-wf-field">
          <span>{t("workflow.conditionExpected")}</span>
          <input
            type="number"
            value={expr.expected}
            onChange={(e) =>
              onChange({ ...expr, expected: Number(e.target.value) || 0 })
            }
          />
        </label>
      )}

      {expr.type === "status_in_range" && (
        <>
          <label className="lok-wf-field">
            <span>{t("workflow.conditionMin")}</span>
            <input
              type="number"
              value={expr.min}
              onChange={(e) => onChange({ ...expr, min: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="lok-wf-field">
            <span>{t("workflow.conditionMax")}</span>
            <input
              type="number"
              value={expr.max}
              onChange={(e) => onChange({ ...expr, max: Number(e.target.value) || 0 })}
            />
          </label>
        </>
      )}

      {(expr.type === "json_path_exists" || expr.type === "json_path_equals") && (
        <label className="lok-wf-field">
          <span>{t("workflow.conditionPath")}</span>
          <input
            type="text"
            value={expr.path}
            onChange={(e) => onChange({ ...expr, path: e.target.value })}
          />
        </label>
      )}

      {expr.type === "json_path_equals" && (
        <label className="lok-wf-field">
          <span>{t("workflow.conditionExpected")}</span>
          <input
            type="text"
            value={expr.expected}
            onChange={(e) => onChange({ ...expr, expected: e.target.value })}
          />
        </label>
      )}
    </>
  );
}
