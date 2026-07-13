import { useT } from "../../i18n/useT";

export type BodyViewMode = "raw" | "pretty" | "preview";

interface BodyViewToggleProps {
  mode: BodyViewMode;
  onChange: (mode: BodyViewMode) => void;
}

const MODES: { key: BodyViewMode; labelKey: "response.viewRaw" | "response.viewPretty" | "response.viewPreview" }[] = [
  { key: "raw", labelKey: "response.viewRaw" },
  { key: "pretty", labelKey: "response.viewPretty" },
  { key: "preview", labelKey: "response.viewPreview" },
];

/** Segmented Raw / Pretty / Preview switch shown above an HTML response body. */
export function BodyViewToggle({ mode, onChange }: BodyViewToggleProps) {
  const t = useT();
  return (
    <div
      className="resp-view-toggle"
      role="tablist"
      aria-label={t("response.viewModeLabel")}
    >
      {MODES.map(({ key, labelKey }) => {
        const selected = key === mode;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "resp-view-btn active" : "resp-view-btn"}
            onClick={() => onChange(key)}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
