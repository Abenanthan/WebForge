import styles from './LabHeader.module.css';

/**
 * Common header for every laboratory: title, one-line purpose, the concepts
 * it teaches (coloured by layer) and optional actions.
 */
export function LabHeader({ title, description, concepts = [], layer = 'ui', icon: Icon, actions, children }) {
  return (
    <header className={styles.header} style={{ '--layer': `var(--layer-${layer})` }}>
      <div className={styles.main}>
        {Icon && <span className={styles.icon}><Icon size={20} aria-hidden="true" /></span>}
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
          {concepts.length > 0 && (
            <ul className={styles.concepts} aria-label="Concepts covered">
              {concepts.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}
