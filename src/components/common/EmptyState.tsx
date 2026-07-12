import type { ReactNode } from "react";

interface EmptyStateProps {
  headline: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  shortcut?: string;
  icon?: ReactNode;
}

/** Empty state with a heat-glow hero and a single primary action, per the UX
 *  foundation §10 — never a dead end. */
export function EmptyState({
  headline,
  hint,
  actionLabel,
  onAction,
  shortcut,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden
          className="lok-heat-glow absolute inset-0"
          style={{ transform: "scale(2.4)" }}
        />
        <span
          aria-hidden
          className="relative"
          style={{ fontSize: "var(--lok-fs-2xl)" }}
        >
          {icon ?? "⚡"}
        </span>
      </div>
      <h2
        className="lok-heat-text"
        style={{
          fontSize: "var(--lok-fs-xl)",
          fontWeight: "var(--lok-fw-bold)",
          lineHeight: "var(--lok-lh-tight)",
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
            <kbd
              className="lok-mono"
              style={{
                fontSize: "var(--lok-fs-2xs)",
                opacity: 0.85,
              }}
            >
              {shortcut}
            </kbd>
          )}
        </button>
      )}
    </div>
  );
}
