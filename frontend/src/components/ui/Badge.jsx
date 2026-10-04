import styles from './ui.module.css';

/** @param {'neutral'|'accent'|'success'|'warning'|'danger'} tone */
export function Badge({ tone = 'neutral', children, className = '', ...rest }) {
  return (
    <span className={`${styles.badge} ${tone !== 'neutral' ? styles[`badge-${tone}`] : ''} ${className}`} {...rest}>
      {children}
    </span>
  );
}
