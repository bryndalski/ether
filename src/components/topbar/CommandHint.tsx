import { useUiStore } from "../../state/useUiStore";

/** ⌘K affordance in the titlebar; also opens the palette on click. */
export function CommandHint() {
  const openPalette = useUiStore((state) => state.openPalette);
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Otwórz paletę poleceń"
      className="flex items-center gap-1 rounded-[var(--lok-radius-sm)] px-2 py-1 transition-colors hover:bg-[var(--lok-bg-hover)]"
      style={{
        color: "var(--lok-text-tertiary)",
        border: "1px solid var(--lok-border-default)",
      }}
    >
      <kbd className="lok-mono" style={{ fontSize: "var(--lok-fs-2xs)" }}>
        ⌘K
      </kbd>
    </button>
  );
}
