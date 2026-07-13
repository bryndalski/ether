import { Command } from "cmdk";
import { Icon } from "../common/Icon";

interface PaletteItemProps {
  value: string;
  label: string;
  shortcut?: string;
  keywords?: string[];
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A single ⌘K result row: label + optional shortcut hint. `active` marks the
 *  current environment (aria-current + a check); `disabled` dims + blocks it. */
export function PaletteItem({
  value,
  label,
  shortcut,
  keywords,
  active,
  disabled,
  onSelect,
}: PaletteItemProps) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      disabled={disabled}
      aria-current={active ? "true" : undefined}
      onSelect={disabled ? undefined : onSelect}
      className="lok-palette-item"
    >
      {active && (
        <span className="lok-palette-check" aria-hidden>
          <Icon name="i-check" size={13} />
        </span>
      )}
      <span>{label}</span>
      {shortcut && (
        <kbd className="lok-mono lok-palette-kbd lok-kbd-chip">{shortcut}</kbd>
      )}
    </Command.Item>
  );
}
