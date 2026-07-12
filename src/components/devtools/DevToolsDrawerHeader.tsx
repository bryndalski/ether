import { Icon } from "../common/Icon";

interface DevToolsDrawerHeaderProps {
  onClose: () => void;
}

/** Fixed drawer chrome: title + close ✕. */
export function DevToolsDrawerHeader({ onClose }: DevToolsDrawerHeaderProps) {
  return (
    <div className="dv-drawer-head">
      <h2 id="dv-drawer-title" className="dv-drawer-title">
        <Icon name="i-key" size={15} />
        Dev-Tools
      </h2>
      <button
        type="button"
        className="dv-btn dv-btn-ghost"
        aria-label="Zamknij Dev-Tools"
        onClick={onClose}
      >
        <Icon name="i-x" size={15} />
      </button>
    </div>
  );
}
