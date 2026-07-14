// Single entry point for the inline-SVG sprite (see IconSprite). References
// #i-* symbols; no CDN, one source of Lucide paths.

export type IconName =
  | "i-flame"
  | "i-send"
  | "i-check"
  | "i-chev"
  | "i-chevr"
  | "i-search"
  | "i-plus"
  | "i-folder"
  | "i-x"
  | "i-copy"
  | "i-more"
  | "i-panel-left"
  | "i-trash"
  | "i-lock"
  | "i-unlock"
  | "i-shield"
  | "i-settings"
  | "i-save"
  | "i-arrow-up"
  | "i-arrow-down"
  | "i-refresh"
  | "i-play"
  | "i-book"
  | "i-braces"
  | "i-graph"
  | "i-history"
  | "i-replay"
  | "i-diff"
  | "i-bar-chart"
  | "i-key"
  | "i-clock"
  | "i-alert"
  | "i-globe"
  | "i-flow"
  | "i-download";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#${name}`} />
    </svg>
  );
}
