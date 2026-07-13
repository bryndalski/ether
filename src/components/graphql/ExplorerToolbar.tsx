import { useRef, useState, type ReactNode } from "react";
import type { OperationType } from "../../lib/graphqlSelection";
import type { SchemaState } from "../../hooks/useGraphqlSchema";
import type { SendState } from "../../hooks/useSendRequest";
import { useToolbarOverflow } from "../../hooks/useToolbarOverflow";
import { OperationPicker } from "./OperationPicker";
import { UrlInput } from "../workbench/UrlInput";
import { RefreshSchemaButton } from "./RefreshSchemaButton";
import { RunButton } from "./RunButton";
import { Icon } from "../common/Icon";
import { RowContextMenu, type MenuItem } from "../sidebar/RowContextMenu";
import { useT } from "../../i18n/useT";

interface ExplorerToolbarProps {
  opType: OperationType;
  availableOps: OperationType[];
  onOpType: (opType: OperationType) => void;
  url: string;
  onUrl: (url: string) => void;
  schemaState: SchemaState;
  onRefresh: () => void;
  sendState: SendState;
  runDisabled: boolean;
  onRun: () => void;
  onCancel: () => void;
  // When the operation is a subscription the toolbar shows this
  // Subscribe/Unsubscribe control instead of RunButton (query/mutation path is
  // untouched). Exactly one of {RunButton, subscribeButton} renders.
  subscribeButton?: ReactNode;
  // Shared workbench controls, injected in GraphQL mode so there is exactly
  // one toolbar (no duplicate RequestBar). See blueprint §4.b Option A.
  requestTypeToggle?: ReactNode;
  onSave?: () => void;
  onCopyCurl?: () => void;
  dirty?: boolean;
}

// Below this toolbar width the secondary actions (Refresh/Save/Copy) fold into a
// `⋯` menu so the URL keeps its min-width and Run/Subscribe never shrink. Mirrors
// the REST toolbar's priority: URL + primary action own the row. Chosen so the
// fold happens before the 40px Run would clip at the min-width URL floor: the
// reqtype toggle + op-select + 320px URL + "Refresh schema"/Save/Copy + Run no
// longer fit under ~900px, so we collapse there.
const COLLAPSE_BELOW_PX = 900;

/** The single 52px GraphQL toolbar: request-type toggle + operation picker +
 *  endpoint URL (elastic flex, min-width protected) + Refresh/Save/Copy +
 *  Run/Subscribe. Secondary actions collapse into a `⋯` overflow menu at narrow
 *  widths; the primary action always renders full-width. The REST RequestBar is
 *  not rendered in GraphQL mode, so this is the only toolbar/URL/Run. */
export function ExplorerToolbar({
  opType,
  availableOps,
  onOpType,
  url,
  onUrl,
  schemaState,
  onRefresh,
  sendState,
  runDisabled,
  onRun,
  onCancel,
  subscribeButton,
  requestTypeToggle,
  onSave,
  onCopyCurl,
  dirty,
}: ExplorerToolbarProps) {
  const t = useT();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const collapsed = useToolbarOverflow(toolbarRef, COLLAPSE_BELOW_PX);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );

  const urlEmpty = url.trim() === "";

  const overflowItems: MenuItem[] = [
    {
      label: t("graphql.refreshSchema"),
      icon: "i-refresh",
      onSelect: onRefresh,
    },
    ...(onSave
      ? [
          {
            label: t("palette.saveRequest"),
            icon: "i-save" as const,
            onSelect: () => {
              if (dirty) onSave();
            },
          },
        ]
      : []),
    ...(onCopyCurl
      ? [
          {
            label: t("workbench.copyAsCurl"),
            icon: "i-copy" as const,
            onSelect: () => {
              if (!urlEmpty) onCopyCurl();
            },
          },
        ]
      : []),
  ];

  return (
    <div
      className="toolbar"
      role="toolbar"
      aria-label={t("graphql.toolbar")}
      ref={toolbarRef}
    >
      {requestTypeToggle}
      <OperationPicker opType={opType} available={availableOps} onChange={onOpType} />
      <UrlInput url={url} onChange={onUrl} onEnter={onRun} />

      {collapsed ? (
        <>
          <button
            type="button"
            ref={overflowBtnRef}
            className="lok-btn lok-btn--md lok-btn--neutral lok-btn--icon"
            aria-label={t("common.moreActions")}
            aria-haspopup="menu"
            title={t("common.moreActions")}
            onClick={() => {
              const rect = overflowBtnRef.current?.getBoundingClientRect();
              if (rect) setMenuAnchor({ x: rect.right - 200, y: rect.bottom + 4 });
            }}
          >
            <Icon name="i-more" size={17} />
          </button>
          {menuAnchor && (
            <RowContextMenu
              items={overflowItems}
              anchor={menuAnchor}
              onClose={() => setMenuAnchor(null)}
            />
          )}
        </>
      ) : (
        <>
          <RefreshSchemaButton state={schemaState} onRefresh={onRefresh} />
          {onSave && (
            <button
              type="button"
              className="lok-btn lok-btn--md lok-btn--neutral lok-btn--icon btn-save"
              aria-label={t("palette.saveRequest")}
              title={t("workbench.saveRequestTitle")}
              disabled={!dirty}
              onClick={onSave}
            >
              <Icon name="i-save" size={17} />
            </button>
          )}
          {onCopyCurl && (
            <button
              type="button"
              className="lok-btn lok-btn--md lok-btn--neutral lok-btn--icon btn-save"
              aria-label={t("workbench.copyAsCurlAria")}
              title={t("workbench.copyAsCurl")}
              disabled={urlEmpty}
              onClick={onCopyCurl}
            >
              <Icon name="i-copy" size={17} />
            </button>
          )}
        </>
      )}

      {subscribeButton ?? (
        <RunButton
          sendState={sendState}
          disabled={runDisabled}
          onRun={onRun}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
