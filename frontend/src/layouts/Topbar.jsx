import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useAuth } from '../app/providers/AuthProvider.jsx';
import { useTheme } from '../app/providers/ThemeProvider.jsx';
import { useToast } from '../app/providers/ToastProvider.jsx';
import { findModuleByPath } from '../app/modules.js';
import { Button } from '../components/ui/Button.jsx';
import { ApiStatus } from './ApiStatus.jsx';
import styles from './Topbar.module.css';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      toast.success('You have been logged out.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message ?? 'Logout failed.');
      setBusy(false);
    }
  }

  return (
    <div className={styles.userMenu} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatarButton}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.avatar} aria-hidden="true">{initials(user?.name)}</span>
        <span className={styles.userName}>{user?.name}</span>
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div id={menuId} className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <p className={styles.dropdownName}>{user?.name}</p>
            <p className={styles.dropdownEmail}>{user?.email}</p>
            <p className={styles.dropdownRole}>{user?.role}</p>
          </div>
          <Button variant="ghost" block icon={LogOut} loading={busy} onClick={handleLogout} className={styles.dropdownAction}>
            Log out
          </Button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onOpenMenu, menuOpen }) {
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const current = findModuleByPath(pathname);

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onOpenMenu}
        aria-label="Open navigation"
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <div className={styles.titleArea}>
        <p className={styles.crumb}>WebForge</p>
        <span className={styles.sep} aria-hidden="true">/</span>
        <p className={styles.title}>{current?.title ?? 'Not found'}</p>
      </div>

      <div className={styles.actions}>
        <ApiStatus />
        <Button
          variant="ghost"
          icon={theme === 'dark' ? Sun : Moon}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        />
        <UserMenu />
      </div>
    </header>
  );
}
