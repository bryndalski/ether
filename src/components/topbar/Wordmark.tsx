import { useT } from "../../i18n/useT";

/** Brand wordmark painted with the heat gradient. */
export function Wordmark() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 pl-2">
      <span
        aria-hidden
        className="lok-heat-gradient"
        style={{ width: 14, height: 14, borderRadius: "var(--lok-radius-xs)" }}
      />
      <span
        className="lok-heat-text select-none"
        style={{
          fontWeight: "var(--lok-fw-bold)",
          fontSize: "var(--lok-fs-md)",
          letterSpacing: "var(--lok-tracking-tight)",
        }}
      >
        {t("brand.name")}
      </span>
    </div>
  );
}
