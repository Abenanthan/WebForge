import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';
import styles from './Modal.module.css';

/**
 * Accessible modal built on the native <dialog> element, which provides
 * focus trapping, Escape-to-close and an inert background for free.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles[size]}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close dialog" />
          </header>
          {description && <p id={descId} className={styles.description}>{description}</p>}
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
