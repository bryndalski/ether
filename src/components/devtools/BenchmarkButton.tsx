import { Icon } from "../common/Icon";

interface BenchmarkButtonProps {
  disabled: boolean;
  onClick: () => void;
}

/** The "Benchmark" toolbar button next to Send. It never starts the loop — it
 *  opens the warned launcher (see BenchmarkLauncher). Disabled when the URL is
 *  empty or a request is in flight. */
export function BenchmarkButton({ disabled, onClick }: BenchmarkButtonProps) {
  return (
    <button
      type="button"
      className="dv-bench-btn"
      aria-label="Benchmark tego requestu"
      title="Benchmark (mierzy p50/p95/p99)"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name="i-bar-chart" size={15} />
      <span>Benchmark</span>
    </button>
  );
}
