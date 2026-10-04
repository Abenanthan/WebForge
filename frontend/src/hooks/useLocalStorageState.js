import { useEffect, useState } from 'react';

/** useState persisted to localStorage (for per-viewer UI preferences only). */
export function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initialValue : JSON.parse(raw);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* preference only */
    }
  }, [key, value]);

  return [value, setValue];
}
