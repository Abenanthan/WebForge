import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { EmptyState } from '../../components/ui/StateView.jsx';
import styles from './Panels.module.css';

const ICONS = { error: CircleAlert, warning: TriangleAlert, info: Info };
const KIND_LABELS = {
  syntax: 'Syntax error',
  runtime: 'Runtime error',
  promise: 'Unhandled rejection',
  resource: 'Resource',
  link: 'Linking',
  unlinked: 'Unused file',
  doctype: 'Document',
  sandbox: 'Sandbox',
};

/** Syntax, runtime and linking problems; locations jump to the line in the editor. */
export function ProblemsPanel({ problems, onJump, openableFiles }) {
  if (!problems.length) {
    return (
      <div className={styles.panel}>
        <EmptyState icon={CircleCheck} title="No problems detected">
          Syntax errors, runtime errors and linking issues from the last run are listed here.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <ul className={styles.problemList} aria-label="Problems">
        {problems.map((p) => {
          const Icon = ICONS[p.severity];
          const location = p.file ? `${p.file}${p.line ? `:${p.line}${p.col ? `:${p.col}` : ''}` : ''}` : null;
          return (
            <li key={p.id} className={`${styles.problem} ${styles[`sev-${p.severity}`]}`}>
              <Icon size={15} className={styles.problemIcon} aria-label={p.severity} />
              <div className={styles.problemBody}>
                <p className={styles.problemMessage}>{p.message}</p>
                <p className={styles.problemMeta}>
                  <span>{KIND_LABELS[p.kind] ?? p.kind}</span>
                  {location && (
                    openableFiles.includes(p.file) ? (
                      <button type="button" className={styles.location} onClick={() => onJump(p.file, p.line, p.col)}>
                        {location}
                      </button>
                    ) : <span className={styles.locationStatic}>{location}</span>
                  )}
                </p>
                {p.stack && <pre className={styles.stack}>{p.stack}</pre>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
