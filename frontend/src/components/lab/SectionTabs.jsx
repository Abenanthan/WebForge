import { NavLink } from 'react-router-dom';
import styles from './SectionTabs.module.css';

/**
 * Route-based section navigation for labs with several parts
 * (e.g. /lab/server-lab, /lab/server-lab/form …).
 * sections: [{ to, label, icon, end? }]
 */
export function SectionTabs({ sections, label, layer = 'ui' }) {
  return (
    <nav className={styles.sections} aria-label={label} style={{ '--layer': `var(--layer-${layer})` }}>
      {sections.map(({ to, end, label: text, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.section} ${isActive ? styles.active : ''}`}>
          {Icon && <Icon size={15} aria-hidden="true" />}
          {text}
        </NavLink>
      ))}
    </nav>
  );
}
