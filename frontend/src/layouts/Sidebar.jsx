import { NavLink } from 'react-router-dom';
import { Lock, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { MODULE_GROUPS } from '../app/modules.js';
import { Logo } from '../components/ui/Logo.jsx';
import styles from './Sidebar.module.css';

function NavItem({ module, collapsed }) {
  const Icon = module.icon;
  const style = { '--item-layer': `var(--layer-${module.layer})` };

  if (module.status !== 'ready') {
    // Planned modules are listed so the product map is visible, but are not links.
    const note = `${module.title} — available in Phase ${module.phase}`;
    return (
      <li>
        <span className={`${styles.item} ${styles.planned}`} style={style} aria-disabled="true" title={note}>
          <Icon size={18} aria-hidden="true" className={styles.icon} />
          <span className={styles.label}>{module.title}</span>
          <span className={styles.phase} aria-hidden="true"><Lock size={10} />P{module.phase}</span>
          <span className="sr-only">(available in Phase {module.phase})</span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <NavLink
        to={module.path}
        end={module.path === '/'}
        className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
        style={style}
        title={collapsed ? module.title : undefined}
      >
        <Icon size={18} aria-hidden="true" className={styles.icon} />
        <span className={styles.label}>{module.title}</span>
      </NavLink>
    </li>
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  return (
    <aside
      id="app-sidebar"
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
      aria-label="Primary"
    >
      <div className={styles.brand}>
        <Logo compact={collapsed} />
        <button type="button" className={styles.mobileClose} onClick={onCloseMobile} aria-label="Close navigation">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Modules">
        {MODULE_GROUPS.map((group) => (
          <div key={group.id} className={styles.group}>
            <h2 className={styles.groupLabel}>{group.label}</h2>
            <ul>
              {group.modules.map((m) => <NavItem key={m.id} module={m} collapsed={collapsed} />)}
            </ul>
          </div>
        ))}
      </nav>

      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-controls="app-sidebar"
        aria-expanded={!collapsed}
      >
        {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        <span className={styles.label}>Collapse</span>
      </button>
    </aside>
  );
}
