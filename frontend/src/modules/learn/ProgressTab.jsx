import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../services/apiClient.js';
import styles from './Learn.module.css';

const CATEGORY_LABELS = {
  html: 'HTML', css: 'CSS', js: 'JavaScript', dom: 'DOM & Events', ajax: 'AJAX & HTTP',
  php: 'PHP', sql: 'SQL', react: 'React', routing: 'Routing',
};

export default function ProgressTab() {
  const progress = useApi((signal) => api.get('/progress', { signal }), []);
  if (progress.status === 'loading' && !progress.data) return <LoadingState label="Calculating your progress…" />;
  if (progress.status === 'error') return <ErrorState error={progress.error} onRetry={progress.reload} />;

  const { overall, concepts } = progress.data;
  const groups = Object.keys(CATEGORY_LABELS)
    .map((cat) => [cat, concepts.filter((c) => c.category === cat)])
    .filter(([, list]) => list.length);

  return (
    <div className={styles.progressPage}>
      <Card title="Overall mastery" icon={TrendingUp}>
        <div className={styles.overall}>
          <strong>{overall}%</strong>
          <ProgressBar value={overall} label="Overall mastery" />
        </div>
        <p className={styles.muted}>
          Each concept’s mastery comes from two real measures: the share of its lab experiments you completed, and the share of its
          quiz questions whose latest answer is correct. When a concept has both, each counts for half.
        </p>
      </Card>

      {groups.map(([cat, list]) => (
        <Card key={cat} title={CATEGORY_LABELS[cat]}>
          <ul className={styles.concepts} aria-label={`${CATEGORY_LABELS[cat]} concepts`}>
            {list.map((c) => (
              <li key={c.slug}>
                <div className={styles.conceptHead}>
                  <span className={styles.conceptTitle}>{c.title}</span>
                  <span className={styles.conceptPct}>{c.mastery}%</span>
                </div>
                <ProgressBar value={c.mastery} label={`${c.title} mastery`} />
                <p className={styles.conceptMeta}>
                  {c.experimentsTotal > 0 && <span>Experiments {c.experimentsDone}/{c.experimentsTotal}</span>}
                  {c.questionsTotal > 0 && <span>Quiz {c.questionsCorrect}/{c.questionsTotal} correct{c.questionsAnswered === 0 && ' (not attempted)'}</span>}
                  <Link to={c.labPath}>Practise →</Link>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
