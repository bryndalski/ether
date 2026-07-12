interface SendButtonProps {
  disabled?: boolean;
  onSend?: () => void;
}

/** The signature Send button: heat gradient fill, ⚡ icon, ⌘↵ affordance. */
export function SendButton({ disabled, onSend }: SendButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSend}
      className="lok-heat-gradient flex items-center gap-2 rounded-[var(--lok-radius-sm)] px-4 py-1.5 transition-transform active:scale-[0.98] disabled:opacity-60"
      style={{
        color: "var(--lok-text-on-heat)",
        fontSize: "var(--lok-fs-md)",
        fontWeight: "var(--lok-fw-semibold)",
        background: disabled ? "var(--lok-bg-raised)" : undefined,
      }}
    >
      <span aria-hidden>⚡</span>
      Send
      <kbd
        className="lok-mono"
        style={{ fontSize: "var(--lok-fs-2xs)", opacity: 0.85 }}
      >
        ⌘↵
      </kbd>
    </button>
  );
}
