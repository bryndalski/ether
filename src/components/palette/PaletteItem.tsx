import { Command } from "cmdk";

interface PaletteItemProps {
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

/** A single ⌘K result row with an optional keyboard-shortcut hint. */
export function PaletteItem({ label, shortcut, onSelect }: PaletteItemProps) {
  return (
    <Command.Item onSelect={onSelect} className="lok-palette-item">
      <span>{label}</span>
      {shortcut && (
        <kbd className="lok-mono lok-palette-kbd">{shortcut}</kbd>
      )}
    </Command.Item>
  );
}
