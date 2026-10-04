import { useId } from 'react';
import { Link } from 'react-router-dom';
import styles from './ui.module.css';

export function LogoMark({ size = 28 }) {
  const gradientId = `wf-logo${useId().replace(/:/g, '')}`;
  return (
    <svg className={styles.logoMark} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c8cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#0d1220" />
      <path d="M7 10l4 12 5-9 5 9 4-12" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false, to = '/' }) {
  return (
    <Link to={to} className={styles.logo} aria-label="WebForge home">
      <LogoMark />
      {!compact && <span className={styles.logoText}>Web<span>Forge</span></span>}
    </Link>
  );
}
