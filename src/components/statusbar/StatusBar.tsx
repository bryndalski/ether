import { useEnvStore } from "../../state/useEnvStore";
import { HealthDot } from "../common/HealthDot";

/** Bottom status strip (26px): active env, connection meta, version. */
export function StatusBar() {
  const activeEnvironment = useEnvStore((state) => state.activeEnvironment());

  return (
    <footer
      className="flex shrink-0 items-center gap-4 px-3"
      style={{
        height: "var(--lok-statusbar-h)",
        backgroundColor: "var(--lok-bg-sidebar)",
        borderTop: "1px solid var(--lok-border-subtle)",
        color: "var(--lok-text-tertiary)",
        fontSize: "var(--lok-fs-2xs)",
      }}
    >
      <span className="flex items-center gap-1.5">
        <HealthDot />
        {activeEnvironment?.name ?? "brak env"}
      </span>
      <span className="lok-mono">HTTP/2</span>
      <span className="lok-mono">— ms</span>
      <span className="lok-mono ml-auto">v0.1.0</span>
    </footer>
  );
}
