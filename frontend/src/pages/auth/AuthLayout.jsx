import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { Logo } from '../../components/ui/Logo.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useTheme } from '../../app/providers/ThemeProvider.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import styles from './Auth.module.css';

// The layers one operation crosses: the idea behind the Execution Trace.
const LAYERS = [
  { name: 'User action', layer: 'ui', detail: 'click · submit · input' },
  { name: 'JavaScript event', layer: 'event', detail: 'listener → handler' },
  { name: 'Client validation', layer: 'validation', detail: 'rules in the browser' },
  { name: 'Async request', layer: 'network', detail: 'fetch → HTTP' },
  { name: 'PHP server', layer: 'server', detail: 'session · CSRF · logic' },
  { name: 'MySQL', layer: 'database', detail: 'prepared statements' },
  { name: 'State update', layer: 'state', detail: 'setState → re-render' },
];

export function AuthLayout() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={styles.layout}>
      <aside className={styles.brandPanel}>
        <Logo />
        <div className={styles.pitch}>
          <h1 className={styles.headline}>
            Don&apos;t just write web code.
            <span> See how it works.</span>
          </h1>
          <p className={styles.sub}>
            An interactive laboratory for HTML, JavaScript, PHP, MySQL and React, where every operation can be traced
            from the click that starts it to the pixels it changes.
          </p>
        </div>

        <figure className={styles.layers}>
          <figcaption className={styles.layersCaption}>One operation, every layer</figcaption>
          <ol>
            {LAYERS.map((l, i) => (
              <li key={l.name} className={styles.layer} style={{ '--layer': `var(--layer-${l.layer})`, '--i': i }}>
                <span className={styles.layerDot} aria-hidden="true" />
                <span className={styles.layerName}>{l.name}</span>
                <span className={styles.layerDetail}>{l.detail}</span>
              </li>
            ))}
          </ol>
        </figure>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formTopbar}>
          <Button
            variant="ghost"
            icon={theme === 'dark' ? Sun : Moon}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          />
        </div>
        <div className={styles.formWrap}>
          <Suspense fallback={<LoadingState label="Loading…" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
