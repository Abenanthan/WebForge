import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { LoadingState } from '../components/ui/StateView.jsx';
import styles from './AppShell.module.css';

const COLLAPSE_KEY = 'webforge.sidebarCollapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* non-essential preference */
    }
  }, [collapsed]);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      <a href="#main" className={styles.skipLink}>Skip to content</a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className={styles.scrim} onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className={styles.main}>
        <Topbar onOpenMenu={() => setMobileOpen(true)} menuOpen={mobileOpen} />
        <main id="main" tabIndex={-1} className={styles.content}>
          <Suspense fallback={<LoadingState label="Loading module…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
