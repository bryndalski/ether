import { useEffect, useRef } from "react";
import { Icon, type IconName } from "../common/Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

interface RowContextMenuProps {
  items: MenuItem[];
  anchor: { x: number; y: number };
  onClose: () => void;
}

/** A role="menu" overlay anchored to a tree row. Arrow-key nav, Esc / click-away
 *  closes, destructive items carry the danger token. */
export function RowContextMenu({ items, anchor, onClose }: RowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function onDocClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Akcje wiersza"
      className="row-menu"
      style={{ left: anchor.x, top: anchor.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? "danger" : undefined}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.icon && <Icon name={item.icon} size={14} />}
          {item.label}
        </button>
      ))}
    </div>
  );
}
