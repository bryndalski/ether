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
  | "i-copy";

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
