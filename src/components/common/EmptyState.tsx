import type { ReactNode } from "react";

interface EmptyStateProps {
  headline: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  shortcut?: string;
  icon?: ReactNode;
  /** Render the heat-glow bloom behind the icon AND paint the headline with the
   *  heat gradient. Only ONE empty region per screen may set this (the primary
   *  editor/response hero); secondary panes stay quiet and glow-less. When false
   *  the headline is solid `--lok-text-primary` (the "one hot thing" rule — heat
   *  is spent on Send/Run, not on every empty headline). Default false. */
  glow?: boolean;
  /** Compact variant for secondary rails (e.g. the sidebar): small icon, one
   *  line, a quiet ghost action — never a competing hero. Default false. */
  compact?: boolean;
}

/** Empty state per the UX foundation §10 — never a dead end. A single primary
 *  action; the glow is reserved for the one true hero on a screen (see `glow`),
 *  and secondary rails use `compact`. */
export function EmptyState({
  headline,
  hint,
  actionLabel,
  onAction,
  shortcut,
  icon,
  glow = false,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <span
          aria-hidden
          style={{ fontSize: "var(--lok-fs-lg)", opacity: 0.7 }}
        >
          {icon ?? "⚡"}
        </span>
        <p
          style={{
            color: "var(--lok-text-secondary)",
            fontSize: "var(--lok-fs-sm)",
          }}
        >
          {headline}
        </p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-2 rounded-[var(--lok-radius-sm)] px-3 py-1 transition-colors"
            style={{
              color: "var(--lok-text-secondary)",
              fontSize: "var(--lok-fs-sm)",
              border: "1px solid var(--lok-border-default)",
              backgroundColor: "var(--lok-bg-raised)",
            }}
          >
            {actionLabel}
            {shortcut && (
              <kbd
                className="lok-mono lok-kbd-chip"
                style={{ color: "var(--lok-text-secondary)" }}
              >
                {shortcut}
              </kbd>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="relative flex items-center justify-center">
        {glow && (
          <span
            aria-hidden
            className="lok-heat-glow absolute inset-0"
            style={{ transform: "scale(1.4)" }}
          />
        )}
        <span
          aria-hidden
          className="relative"
          style={{ fontSize: "var(--lok-fs-2xl)" }}
        >
          {icon ?? "⚡"}
        </span>
      </div>
      <h2
        className={glow ? "lok-heat-text" : undefined}
        style={{
          fontSize: "var(--lok-fs-xl)",
          fontWeight: "var(--lok-fw-bold)",
          lineHeight: "var(--lok-lh-tight)",
          color: glow ? undefined : "var(--lok-text-primary)",
        }}
      >
        {headline}
      </h2>
      <p
        style={{
          color: "var(--lok-text-tertiary)",
          fontSize: "var(--lok-fs-sm)",
          maxWidth: 260,
        }}
      >
        {hint}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="lok-heat-gradient mt-1 flex items-center gap-2 rounded-[var(--lok-radius-sm)] px-4 py-2 transition-transform active:scale-[0.98]"
          style={{
            color: "var(--lok-text-on-heat)",
            fontSize: "var(--lok-fs-md)",
            fontWeight: "var(--lok-fw-semibold)",
          }}
        >
          {actionLabel}
          {shortcut && (
            <kbd className="lok-mono lok-kbd-chip" style={{ color: "inherit" }}>
              {shortcut}
            </kbd>
          )}
        </button>
      )}
    </div>
  );
}
