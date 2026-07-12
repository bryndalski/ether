interface BenchmarkProgressProps {
  completed: number;
  iterations: number;
  onCancel: () => void;
}

/** x/N progress with a heat meter + Cancel, shown while the loop runs. The
 *  region is aria-live so AT announces progress; the meter is CSS-only so the
 *  reduced-motion gate collapses it. */
export function BenchmarkProgress({
  completed,
  iterations,
  onCancel,
}: BenchmarkProgressProps) {
  const pct = iterations > 0 ? Math.round((completed / iterations) * 100) : 0;
  return (
    <div className="dv-progress" aria-live="polite">
      <div className="dv-progress-row">
        <span className="dv-progress-count lok-tnums">
          {completed} / {iterations}
        </span>
        <button
          type="button"
          className="dv-btn dv-btn-danger"
          onClick={onCancel}
        >
          Anuluj
        </button>
      </div>
      <div className="dv-meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="dv-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
