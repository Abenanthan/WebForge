import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FlaskConical, FolderKanban, History, Waypoints } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { api } from '../../services/apiClient.js';
import { relativeTime } from '../../utils/format.js';
import { PROJECT_TYPES } from '../../pages/projects/projectTypes.js';
import styles from './Learn.module.css';

const KINDS = [
  ['', 'All'], ['experiment', 'Experiments'], ['assessment', 'Assessments'], ['project', 'Projects'], ['trace', 'Traces'],
];
const KIND_INFO = {
  experiment: { icon: FlaskConical, layer: 'state' },
  assessment: { icon: ClipboardCheck, layer: 'validation' },
  project: { icon: FolderKanban, layer: 'database' },
  trace: { icon: Waypoints, layer: 'network' },
};

function linkFor(item) {
  if (item.kind === 'assessment') return `/learn/attempts/${item.ref}`;
  if (item.kind === 'project') return PROJECT_TYPES[item.module]?.open(item.ref);
  if (item.kind === 'trace') return `/trace?id=${item.link}`;
  return null;
}

function detail(item) {
  if (item.kind === 'experiment') return `${item.module} · ${item.status}`;
  if (item.kind === 'assessment') return `score ${item.score}`;
  if (item.kind === 'project') return `${PROJECT_TYPES[item.module]?.label ?? item.module} project saved`;
  return `${item.module} · ${item.status}`;
}

export default function HistoryTab() {
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ status: 'loading', items: [], hasMore: false, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    const qs = new URLSearchParams({ page: String(page), ...(kind ? { kind } : {}) });
    api.get(`/activity?${qs}`, { signal: controller.signal }).then(
      (d) => setState((s) => ({ status: 'success', items: page === 1 ? d.items : [...s.items, ...d.items], hasMore: d.hasMore, error: null })),
      (error) => error.name !== 'AbortError' && setState((s) => ({ ...s, status: 'error', error })),
    );
    return () => controller.abort();
  }, [kind, page, reloadKey]);

  const choose = (k) => {
    setKind(k);
    setPage(1);
    setState({ status: 'loading', items: [], hasMore: false, error: null });
  };

  return (
    <Card title="Activity history" icon={History}>
      <div className={styles.kinds} role="radiogroup" aria-label="Activity type">
        {KINDS.map(([id, label]) => (
          <button key={id || 'all'} type="button" role="radio" aria-checked={kind === id} onClick={() => choose(id)}>{label}</button>
        ))}
      </div>

      {state.status === 'error' ? <ErrorState error={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
        : state.status === 'loading' && state.items.length === 0 ? <LoadingState label="Loading history…" />
          : state.items.length === 0 ? <EmptyState icon={History} title="Nothing here yet">Run experiments, take quizzes and save projects; they appear here.</EmptyState>
            : (
              <>
                <ol className={styles.timeline} aria-label="Activity">
                  {state.items.map((item) => {
                    const { icon: Icon, layer } = KIND_INFO[item.kind];
                    const to = linkFor(item);
                    return (
                      <li key={`${item.kind}-${item.ref}`} style={{ '--layer': `var(--layer-${layer})` }}>
                        <span className={styles.kindIcon}><Icon size={15} aria-hidden="true" /></span>
                        <span className={styles.itemText}>
                          {to ? <Link to={to}>{item.title}</Link> : <span>{item.title}</span>}
                          <small className={item.status === 'error' ? styles.poor : undefined}>{detail(item)}</small>
                        </span>
                        <time dateTime={item.at}>{relativeTime(item.at)}</time>
                      </li>
                    );
                  })}
                </ol>
                {state.hasMore && (
                  <Button className={styles.more} loading={state.status === 'loading'} onClick={() => setPage((p) => p + 1)}>Load more</Button>
                )}
              </>
            )}
    </Card>
  );
}
