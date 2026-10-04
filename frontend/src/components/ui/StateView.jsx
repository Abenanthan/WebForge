import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { Spinner } from './Spinner.jsx';
import styles from './ui.module.css';

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className={styles.state}>
      <div className={styles.stateIcon}><Icon size={20} aria-hidden="true" /></div>
      <p className={styles.stateTitle}>{title}</p>
      {children && <p className={styles.stateText}>{children}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry }) {
  return (
    <div className={`${styles.state} ${styles.stateError}`} role="alert">
      <div className={styles.stateIcon}><CircleAlert size={20} aria-hidden="true" /></div>
      <p className={styles.stateTitle}>{title}</p>
      {error && <p className={styles.stateText}>{error.message ?? String(error)}</p>}
      {onRetry && (
        <div className={styles.stateAction}>
          <Button size="sm" icon={RefreshCw} onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className={styles.state} role="status">
      <Spinner size={20} />
      <p className={styles.stateText}>{label}</p>
    </div>
  );
}
