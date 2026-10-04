import { useId } from 'react';
import styles from './ui.module.css';

/** Panel with optional header (title + icon + actions). Renders a <section> labelled by its title. */
export function Card({ title, icon: Icon, actions, children, className = '', bodyClassName = '', as: Tag = 'section', ...rest }) {
  const titleId = useId();
  return (
    <Tag className={`${styles.card} ${className}`} aria-labelledby={title ? titleId : undefined} {...rest}>
      {title && (
        <header className={styles.cardHeader}>
          <h2 id={titleId} className={styles.cardTitle}>
            {Icon && <Icon size={16} aria-hidden="true" />}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={`${styles.cardBody} ${bodyClassName}`}>{children}</div>
    </Tag>
  );
}
