import { useEffect, useState } from 'react';
import { apiRequest } from '../services/apiClient.js';
import { formatMs } from '../utils/format.js';
import styles from './ApiStatus.module.css';

const INTERVAL_MS = 60_000;

/** Live API + database health indicator, re-checked every minute and when the tab regains focus. */
export function ApiStatus() {
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { data, meta } = await apiRequest('/health', { source: 'system' });
        if (!cancelled) setState({ status: 'online', data, ms: meta.durationMs });
      } catch (error) {
        if (!cancelled) setState({ status: 'offline', error });
      }
    }
    check();
    const timer = setInterval(check, INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const label = {
    checking: 'Checking API…',
    online: 'API online',
    offline: 'API offline',
  }[state.status];

  const detail = state.status === 'online'
    ? `PHP ${state.data.php} · ${state.data.dbVersion} · server ${formatMs(state.ms)}`
    : state.status === 'offline' ? state.error.message : '';

  return (
    <div className={`${styles.status} ${styles[state.status]}`} title={detail} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      {detail && <span className="sr-only">{detail}</span>}
    </div>
  );
}
