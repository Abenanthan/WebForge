import { Loader } from 'lucide-react';
import styles from './ui.module.css';

export function Spinner({ size = 16, label }) {
  return (
    <>
      <Loader size={size} className={styles.spinner} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
