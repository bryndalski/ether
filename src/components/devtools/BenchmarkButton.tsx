import { Icon } from "../common/Icon";
import { useT } from "../../i18n/useT";

interface BenchmarkButtonProps {
  disabled: boolean;
  onClick: () => void;
}

/** The "Benchmark" toolbar button next to Send. It never starts the loop — it
 *  opens the warned launcher (see BenchmarkLauncher). Disabled when the URL is
 *  empty or a request is in flight. */
export function BenchmarkButton({ disabled, onClick }: BenchmarkButtonProps) {
  const t = useT();
  return (
    <button
      type="button"
      className="dv-bench-btn"
      aria-label={t("devtools.benchmarkOfRequest")}
      title={t("devtools.benchmarkTitle")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name="i-bar-chart" size={15} />
      <span>{t("devtools.benchmark")}</span>
    </button>
  );
}
