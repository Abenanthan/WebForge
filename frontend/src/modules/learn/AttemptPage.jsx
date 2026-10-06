import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, CircleX, Compass, RotateCcw } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../services/apiClient.js';
import { relativeTime } from '../../utils/format.js';
import { pct } from './AssessmentsTab.jsx';
import styles from './Learn.module.css';

function ScoreRing({ percent }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = percent >= 70 ? 'var(--success)' : percent >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <svg className={styles.ring} viewBox="0 0 120 120" role="img" aria-label={`Score ${percent}%`}>
      <circle cx="60" cy="60" r={r} className={styles.ringTrack} />
      <circle cx="60" cy="60" r={r} stroke={tone} className={styles.ringValue}
        strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle">{percent}%</text>
    </svg>
  );
}

const verdict = (p) => (p === 100 ? 'Perfect score.' : p >= 70 ? 'Well done.' : p >= 40 ? 'Good start: review the explanations below.' : 'Keep practising: the labs below cover what you missed.');

export default function AttemptPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const fresh = state?.result?.id === Number(id) ? state.result : null;
  const attempt = useApi((signal) => (fresh ? Promise.resolve(fresh) : api.get(`/attempts/${id}`, { signal })), [id]);

  if (attempt.status === 'loading' && !attempt.data) return <LoadingState label="Loading result…" />;
  if (attempt.status === 'error') return <ErrorState error={attempt.error} onRetry={attempt.reload} />;

  const a = attempt.data;
  const percent = pct(a.score, a.maxScore);

  return (
    <div className={styles.result}>
      <Link className={styles.back} to="/learn"><ArrowLeft size={14} aria-hidden="true" /> All assessments</Link>

      <Card>
        <div className={styles.summary}>
          <ScoreRing percent={percent} />
          <div>
            <h2>{a.quizTitle}</h2>
            <p className={styles.scoreLine}><strong>{a.score} / {a.maxScore}</strong> correct · {verdict(percent)}</p>
            <p className={styles.muted}>
              Submitted {relativeTime(a.submittedAt)}{a.durationSec != null && ` · took ${Math.floor(a.durationSec / 60)}m ${a.durationSec % 60}s`}
            </p>
            <Link className={styles.startLink} to={`/learn/quiz/${a.quizSlug}`}><RotateCcw size={14} aria-hidden="true" /> Retake quiz</Link>
          </div>
        </div>
      </Card>

      {a.recommended.length > 0 && (
        <Card title="Recommended labs" icon={Compass}>
          <ul className={styles.recommended} aria-label="Recommended labs">
            {a.recommended.map((r) => (
              <li key={r.slug}>
                <span><strong>{r.title}</strong><small>{r.missed} question{r.missed === 1 ? '' : 's'} missed</small></span>
                <Link to={r.labPath}>Open the lab →</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Review">
        <ol className={styles.review} aria-label="Answer review">
          {a.review.map((q, i) => (
            <li key={q.id} className={q.correct ? styles.reviewRight : styles.reviewWrong}>
              <p className={styles.reviewHead}>
                {q.correct ? <CircleCheck size={16} aria-label="Correct" /> : <CircleX size={16} aria-label="Wrong" />}
                <span>{i + 1}. {q.prompt}</span>
              </p>
              {q.code && <pre className={styles.code}>{q.code}</pre>}
              <dl className={styles.answers}>
                <dt>Your answer</dt><dd>{q.yourAnswer ?? <em>not answered</em>}</dd>
                {!q.correct && <><dt>Correct answer</dt><dd>{q.correctAnswer}</dd></>}
              </dl>
              <p className={styles.explanation}>{q.explanation}</p>
              <p className={styles.muted}>Concept: {q.concept}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
