import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { api } from '../../services/apiClient.js';
import styles from './Learn.module.css';

const TYPE_LABELS = { mcq: 'Multiple choice', true_false: 'True or false', output: 'Predict the output', find_error: 'Find the error', match: 'Match the pairs' };

/** An answer counts as given when it can be graded. */
function isAnswered(q, a) {
  if (a === undefined || a === null) return false;
  if (q.type === 'output') return a.trim() !== '';
  if (q.type === 'match') return a.length === q.left.length && a.every((v) => v !== null);
  return true;
}

function Question({ q, value, onChange }) {
  if (q.type === 'output') {
    return (
      <label className={styles.outputAnswer}>
        <span>Your answer</span>
        <input type="text" value={value ?? ''} maxLength={200} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (q.type === 'match') {
    const current = value ?? q.left.map(() => null);
    return (
      <ol className={styles.matchList}>
        {q.left.map((left, i) => (
          <li key={left}>
            <label htmlFor={`match-${q.id}-${i}`}><code>{left}</code></label>
            <select id={`match-${q.id}-${i}`} value={current[i] ?? ''}
              onChange={(e) => onChange(current.map((v, j) => (j === i ? (e.target.value === '' ? null : Number(e.target.value)) : v)))}>
              <option value="">Choose…</option>
              {q.right.map((r, j) => <option key={r} value={j}>{r}</option>)}
            </select>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <fieldset className={styles.options}>
      <legend className="sr-only">Options</legend>
      {q.options.map((o) => (
        <label key={o.id} className={value === o.id ? styles.optionChosen : undefined}>
          <input type="radio" name={`q-${q.id}`} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function QuizPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const quiz = useApi((signal) => api.get(`/quizzes/${slug}`, { signal }), [slug]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setIndex(0);
    setAnswers({});
    startedAt.current = Date.now();
  }, [slug]);

  if (quiz.status === 'loading' && !quiz.data) return <LoadingState label="Loading quiz…" />;
  if (quiz.status === 'error') return <ErrorState error={quiz.error} onRetry={quiz.reload} />;

  const { questions } = quiz.data;
  const q = questions[index];
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.id])).length;
  const unanswered = questions.length - answeredCount;

  async function submit() {
    setConfirm(false);
    setSubmitting(true);
    const payload = Object.fromEntries(questions.filter((x) => isAnswered(x, answers[x.id])).map((x) => [x.id, x.type === 'output' ? answers[x.id].trim() : answers[x.id]]));
    try {
      const result = await api.post(`/quizzes/${slug}/attempts`, {
        answers: payload,
        durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      }, { source: 'learn' });
      navigate(`/learn/attempts/${result.id}`, { state: { result } });
    } catch (err) {
      toast.error(err.message ?? 'Could not submit your answers.');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.quiz}>
      <div className={styles.quizHead}>
        <Link className={styles.back} to="/learn"><ArrowLeft size={14} aria-hidden="true" /> All assessments</Link>
        <h2>{quiz.data.title}</h2>
        <p className={styles.muted}>{answeredCount} of {questions.length} answered</p>
        <ProgressBar value={answeredCount} max={questions.length} label="Questions answered" />
      </div>

      <nav className={styles.dots} aria-label="Questions">
        {questions.map((x, i) => (
          <button key={x.id} type="button" aria-current={i === index ? 'step' : undefined}
            className={isAnswered(x, answers[x.id]) ? styles.dotDone : undefined} onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}${isAnswered(x, answers[x.id]) ? ' (answered)' : ''}`}>
            {i + 1}
          </button>
        ))}
      </nav>

      <Card>
        <div className={styles.question}>
          <p className={styles.qMeta}>Question {index + 1} of {questions.length} · {TYPE_LABELS[q.type]}</p>
          <h3 className={styles.prompt}>{q.prompt}</h3>
          {q.code && <pre className={styles.code}>{q.code}</pre>}
          <Question key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
        </div>
        <div className={styles.quizNav}>
          <Button icon={ArrowLeft} disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
          {index < questions.length - 1
            ? <Button variant="primary" onClick={() => setIndex(index + 1)}>Next <ArrowRight size={16} aria-hidden="true" /></Button>
            : <Button variant="primary" icon={Send} loading={submitting} onClick={() => (unanswered ? setConfirm(true) : submit())}>Submit answers</Button>}
        </div>
      </Card>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit with unanswered questions?" size="sm"
        description={`${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered and will be marked wrong.`}
        footer={<><Button onClick={() => setConfirm(false)}>Keep answering</Button><Button variant="primary" onClick={submit}>Submit anyway</Button></>} />
    </div>
  );
}
