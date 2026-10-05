import styles from './DatabaseLab.module.css';

const KEYWORDS = 'SELECT|FROM|WHERE|AND|OR|ORDER BY|ASC|DESC|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|LIKE|LIMIT|COUNT';
const SPLIT = new RegExp(`(\\b(?:${KEYWORDS})\\b|\\?)`);
const IS_KEYWORD = new RegExp(`^(?:${KEYWORDS})$`);

/** SQL with keywords and placeholders highlighted. Placeholders are numbered to match the params list. */
export function SqlView({ statement }) {
  let index = 0;
  return (
    <pre className={styles.sql}>
      {statement.split(SPLIT).map((part, i) => {
        if (part === '?') {
          index += 1;
          return <mark key={i} className={styles.placeholder} title={`Parameter ${index}`}>?<sub>{index}</sub></mark>;
        }
        return IS_KEYWORD.test(part) ? <span key={i} className={styles.keyword}>{part}</span> : part;
      })}
    </pre>
  );
}

const literal = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** For reading only: what the statement means with its values. PDO never builds this string. */
export function illustrate(statement, params) {
  let i = 0;
  return statement.replace(/\?/g, () => literal(params[i++]));
}

export function SqlEntry({ entry, highlight = false }) {
  return (
    <div className={`${styles.entry} ${highlight ? styles.entryCurrent : ''}`}>
      <div className={styles.entryHead}>
        <span className={`${styles.op} ${styles[`op-${entry.operation}`]}`}>{entry.operation}</span>
        <span className={styles.entryMeta}>
          {entry.operation === 'SELECT' ? `${entry.rowsAffected} row(s) returned` : `${entry.rowsAffected} row(s) affected`}
          {entry.lastInsertId ? ` · lastInsertId ${entry.lastInsertId}` : ''} · {entry.ms} ms
        </span>
      </div>
      <SqlView statement={entry.statement} />
      <ol className={styles.params} aria-label="Bound parameters">
        {entry.params.map((p, i) => (
          <li key={i}><span className={styles.paramIndex}>?{i + 1}</span> <code>{literal(p)}</code></li>
        ))}
      </ol>
    </div>
  );
}
