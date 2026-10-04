import styles from './ui.module.css';

export function ProgressBar({ value, max = 100, label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={styles.progress} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
