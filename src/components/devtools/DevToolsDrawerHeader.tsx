import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface DevToolsDrawerHeaderProps {
  onClose: () => void;
}

/** Fixed drawer chrome: title + close ✕. */
export function DevToolsDrawerHeader({ onClose }: DevToolsDrawerHeaderProps) {
  const t = useT();
  return (
    <div className="dv-drawer-head">
      <h2 id="dv-drawer-title" className="dv-drawer-title">
        <Icon name="i-key" size={15} />
        Dev-Tools
      </h2>
      <button
        type="button"
        className="dv-btn dv-btn-ghost"
        aria-label={t("devtools.closeDevTools")}
        onClick={onClose}
      >
        <Icon name="i-x" size={15} />
      </button>
    </div>
  );
}
