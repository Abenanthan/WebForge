import { forwardRef, useId } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './ui.module.css';

/**
 * Labelled input wired for accessibility: the error and hint are linked via
 * aria-describedby and aria-invalid is set when there is an error.
 */
export const TextField = forwardRef(function TextField(
  { label, error, hint, adornment, id: idProp, className = '', children, ...inputProps },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={`${styles.inputWrap} ${adornment ? styles.hasAdornment : ''}`}>
        <input
          ref={ref}
          id={id}
          className={styles.input}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
          {...inputProps}
        />
        {adornment && <div className={styles.adornment}>{adornment}</div>}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={13} aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && <div id={hintId} className={styles.hint}>{hint}</div>}
      {children}
    </div>
  );
});
