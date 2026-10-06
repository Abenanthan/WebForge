import { Link, useLocation } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { ALL_MODULES } from '../../app/modules.js';
import styles from './LabHeader.module.css';

/** The registered module the current URL belongs to (longest matching path). */
function moduleFor(pathname) {
  return ALL_MODULES
    .filter((m) => m.path !== '/' && (pathname === m.path || pathname.startsWith(`${m.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * Common header for every laboratory: title, one-line purpose, the concepts
 * it teaches (coloured by layer), optional actions and a link to the related quiz.
 */
export function LabHeader({ title, description, concepts = [], layer = 'ui', icon: Icon, actions, children }) {
  const quiz = moduleFor(useLocation().pathname)?.quiz;
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
        {(actions || quiz) && (
          <div className={styles.actions}>
            {actions}
            {quiz && (
              <Link className={styles.quizLink} to={`/learn/quiz/${quiz}`}>
                <GraduationCap size={15} aria-hidden="true" /> Take the quiz
              </Link>
            )}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
