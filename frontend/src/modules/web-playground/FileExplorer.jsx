import { Braces, FileCode, Hash } from 'lucide-react';
import styles from './WebPlayground.module.css';

const FILE_META = {
  html: { icon: FileCode, color: 'var(--layer-dom)', language: 'HTML' },
  css: { icon: Hash, color: 'var(--layer-network)', language: 'CSS' },
  js: { icon: Braces, color: 'var(--layer-event)', language: 'JavaScript' },
};

export function fileMeta(name) {
  return FILE_META[name.split('.').pop()] ?? FILE_META.js;
}

/**
 * Project files as an accessible tab list (arrow keys move between files).
 * Rendered as a vertical explorer on wide screens and a tab strip on narrow ones.
 */
export function FileExplorer({ files, active, modified, problemCounts, onSelect, title }) {
  function onKeyDown(e) {
    const index = files.indexOf(active);
    const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = files[(index + next + files.length) % files.length];
    onSelect(target);
    document.getElementById(`file-tab-${target.replace('.', '-')}`)?.focus();
  }

  return (
    <nav className={styles.explorer} aria-label="Project files">
      <p className={styles.explorerTitle} title={title}>{title}</p>
      <div role="tablist" aria-orientation="vertical" className={styles.fileList} onKeyDown={onKeyDown}>
        {files.map((name) => {
          const meta = fileMeta(name);
          const Icon = meta.icon;
          const selected = name === active;
          const errors = problemCounts[name] ?? 0;
          return (
            <button
              key={name}
              id={`file-tab-${name.replace('.', '-')}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="editor-panel"
              tabIndex={selected ? 0 : -1}
              className={styles.fileItem}
              onClick={() => onSelect(name)}
            >
              <Icon size={15} style={{ color: meta.color }} aria-hidden="true" />
              <span className={styles.fileName}>{name}</span>
              {errors > 0 && <span className={styles.fileErrors} aria-label={`${errors} problem${errors > 1 ? 's' : ''}`}>{errors}</span>}
              {modified.has(name) && <span className={styles.modifiedDot} aria-label="modified" title="Modified" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
