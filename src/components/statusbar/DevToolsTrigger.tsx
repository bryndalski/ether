import { useUiStore } from "../../state/useUiStore";
import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

/** Statusbar affordance that opens the Dev-Tools drawer (JWT decoder, …). Without
 *  it the drawer is dead-wired — the store action exists but nothing calls it. */
export function DevToolsTrigger() {
  const openDevTools = useUiStore((state) => state.openDevTools);
  const t = useT();

  return (
    <button
      type="button"
      className="flex items-center gap-1.5"
      aria-label={t("devtools.openDevTools")}
      title={t("devtools.openDevTools")}
      onClick={openDevTools}
      style={{ color: "var(--lok-text-tertiary)" }}
    >
      <Icon name="i-key" size={13} />
      {t("devtools.title")}
    </button>
  );
}
