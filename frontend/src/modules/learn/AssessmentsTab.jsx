import { Link } from 'react-router-dom';
import { ClipboardList, History } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../services/apiClient.js';
import { relativeTime } from '../../utils/format.js';
import styles from './Learn.module.css';

const DIFFICULTY_TONE = { beginner: 'success', intermediate: 'accent', advanced: 'warning' };
export const pct = (score, max) => (max ? Math.round((score / max) * 100) : 0);

export default function AssessmentsTab() {
  const quizzes = useApi((signal) => api.get('/quizzes', { signal }), []);
  const attempts = useApi((signal) => api.get('/attempts', { signal }), []);

  return (
    <div className={styles.split}>
      <section aria-labelledby="quiz-heading">
        <h2 id="quiz-heading" className="sr-only">Quizzes</h2>
        {quizzes.status === 'loading' && !quizzes.data ? <LoadingState label="Loading quizzes…" />
          : quizzes.status === 'error' ? <ErrorState error={quizzes.error} onRetry={quizzes.reload} />
            : (
              <ul className={styles.quizGrid} aria-label="Quizzes">
                {quizzes.data.map((q) => (
                  <li key={q.slug} className={styles.quizCard}>
                    <div className={styles.quizTop}>
                      <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{q.difficulty}</Badge>
                      <span className={styles.muted}>{q.questions} questions</span>
                    </div>
                    <h3>{q.title}</h3>
                    <p className={styles.quizDesc}>{q.description}</p>
                    <p className={styles.quizStats}>
                      {q.attempts === 0 ? 'Not attempted yet'
                        : <>Best <strong>{q.bestPercent}%</strong> · {q.attempts} attempt{q.attempts === 1 ? '' : 's'} · last {relativeTime(q.lastAttemptAt)}</>}
                    </p>
                    <Link className={styles.startLink} to={`/learn/quiz/${q.slug}`} aria-label={`${q.attempts ? 'Retake' : 'Start'} ${q.title}`}>
                      {q.attempts ? 'Retake' : 'Start'} quiz →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
      </section>

      <Card title="Your attempts" icon={History}>
        {attempts.status === 'loading' && !attempts.data ? <LoadingState label="Loading…" />
          : attempts.status === 'error' ? <ErrorState error={attempts.error} onRetry={attempts.reload} />
            : attempts.data.length === 0 ? <EmptyState icon={ClipboardList} title="No attempts yet">Your graded attempts appear here.</EmptyState>
              : (
                <ol className={styles.attemptList} aria-label="Your attempts">
                  {attempts.data.map((a) => (
                    <li key={a.id}>
                      <Link to={`/learn/attempts/${a.id}`}>
                        <span className={styles.attemptTitle}>{a.quizTitle}</span>
                        <span className={pct(a.score, a.maxScore) >= 70 ? styles.good : pct(a.score, a.maxScore) >= 40 ? styles.okay : styles.poor}>
                          {a.score}/{a.maxScore}
                        </span>
                        <time className={styles.muted} dateTime={a.submittedAt}>{relativeTime(a.submittedAt)}</time>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
      </Card>
    </div>
  );
}
