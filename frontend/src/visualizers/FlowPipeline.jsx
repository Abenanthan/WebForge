import { Check, CircleAlert, Loader, Minus } from 'lucide-react';
import styles from './FlowPipeline.module.css';

const STATUS_ICONS = { done: Check, error: CircleAlert, active: Loader, skipped: Minus };
const STATUS_TEXT = { idle: 'not reached', active: 'running', done: 'completed', error: 'failed', skipped: 'skipped' };

/**
 * A sequence of execution stages (USER ACTION → … → UI UPDATED).
 *
 * steps: [{ id, label, layer, status: 'idle'|'active'|'done'|'error'|'skipped', summary?, time? }]
 * Each step is a button when onSelect is given; the selected step is marked with aria-pressed.
 * The colour of a step is its layer colour (--layer-*), shared across all visualizers.
 */
export function FlowPipeline({ steps, selectedId, onSelect, orientation = 'vertical', label, compact = false }) {
  return (
    <ol
      className={`${styles.pipeline} ${styles[orientation]} ${compact ? styles.compact : ''}`}
      aria-label={label}
    >
      {steps.map((step, index) => {
        const Icon = STATUS_ICONS[step.status];
        const content = (
          <>
            <span className={styles.node} aria-hidden="true">
              {Icon ? <Icon size={compact ? 12 : 14} className={step.status === 'active' ? styles.spin : undefined} /> : index + 1}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{step.label}</span>
              {step.summary && <span className={styles.summary}>{step.summary}</span>}
            </span>
            {step.time != null && <span className={styles.time}>{step.time}</span>}
            <span className="sr-only">({STATUS_TEXT[step.status] ?? step.status})</span>
          </>
        );
        return (
          <li
            key={step.id}
            className={`${styles.step} ${styles[step.status] ?? ''} ${selectedId === step.id ? styles.selected : ''}`}
            style={{ '--layer': `var(--layer-${step.layer ?? 'ui'})` }}
            aria-current={step.status === 'active' ? 'step' : undefined}
          >
            {onSelect ? (
              <button type="button" className={styles.body} onClick={() => onSelect(step.id)} aria-pressed={selectedId === step.id}>
                {content}
              </button>
            ) : (
              <div className={styles.body}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
