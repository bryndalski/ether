import { useEnvStore } from "../../state/useEnvStore";
import { HealthDot } from "../common/HealthDot";
import { HistoryTrigger } from "./HistoryTrigger";
import { DevToolsTrigger } from "./DevToolsTrigger";
import { useT } from "../../i18n/useT";

/** Bottom status strip (26px): active env, connection meta, version. */
export function StatusBar() {
  const activeEnvironment = useEnvStore((state) => state.activeEnvironment());
  const t = useT();

  return (
    <footer
      className="flex shrink-0 items-center gap-4 px-3"
      style={{
        height: "var(--lok-statusbar-h)",
        backgroundColor: "var(--lok-bg-sidebar)",
        borderTop: "1px solid var(--lok-border-subtle)",
        color: "var(--lok-text-tertiary)",
        fontSize: "var(--lok-fs-xs)",
      }}
    >
      <span className="flex items-center gap-1.5">
        <HealthDot health={activeEnvironment ? "up" : "none"} />
        {activeEnvironment?.name ?? t("statusbar.noEnv")}
      </span>
      <HistoryTrigger />
      <DevToolsTrigger />
      <span className="lok-mono ml-auto">v0.1.0</span>
    </footer>
  );
}
