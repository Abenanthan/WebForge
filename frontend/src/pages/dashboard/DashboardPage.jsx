import { Link } from 'react-router-dom';
import {
  ArrowRight, Clock, FlaskConical, FolderKanban, Gauge, GraduationCap, Layers, Lock, Sparkles, Waypoints,
} from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider.jsx';
import { ALL_MODULES, QUICK_LAUNCH_IDS } from '../../app/modules.js';
import { api } from '../../services/apiClient.js';
import { useApi } from '../../hooks/useApi.js';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { firstName, formatMs, greeting, relativeTime } from '../../utils/format.js';
import styles from './DashboardPage.module.css';

const CATEGORY_LABELS = {
  html: 'HTML', css: 'CSS', js: 'JavaScript', dom: 'DOM & Events', ajax: 'AJAX & HTTP',
  php: 'PHP', sql: 'SQL', react: 'React', routing: 'Routing',
};

const ACTIVITY_ICONS = { experiment: FlaskConical, assessment: GraduationCap, project: FolderKanban };

function StatTile({ icon: Icon, label, value, detail, children }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statHead}>
        <span className={styles.statIcon}><Icon size={16} aria-hidden="true" /></span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <p className={styles.statValue}>{value}</p>
      {detail && <p className={styles.statDetail}>{detail}</p>}
      {children}
    </div>
  );
}

function QuickLaunch() {
  const modules = QUICK_LAUNCH_IDS.map((id) => ALL_MODULES.find((m) => m.id === id));
  return (
    <section aria-labelledby="quick-launch-title">
      <div className={styles.sectionHead}>
        <h2 id="quick-launch-title" className={styles.sectionTitle}>Laboratories</h2>
        <p className={styles.sectionNote}>{ALL_MODULES.filter((m) => m.status === 'ready').length} of {ALL_MODULES.length} modules live</p>
      </div>
      <ul className={styles.launchGrid}>
        {modules.map((m) => {
          const Icon = m.icon;
          const ready = m.status === 'ready';
          const body = (
            <>
              <div className={styles.launchTop}>
                <span className={styles.launchIcon}><Icon size={20} aria-hidden="true" /></span>
                {m.signature && <Badge tone="accent"><Sparkles size={11} aria-hidden="true" />Signature</Badge>}
                {!ready && (
                  <Badge className={styles.launchPhase}>
                    <Lock size={10} aria-hidden="true" />Phase {m.phase}
                  </Badge>
                )}
              </div>
              <h3 className={styles.launchTitle}>{m.title}</h3>
              <p className={styles.launchDesc}>{m.description}</p>
              {ready && <ArrowRight size={16} className={styles.launchArrow} aria-hidden="true" />}
            </>
          );
          return (
            <li key={m.id} style={{ '--layer': `var(--layer-${m.layer})` }}>
              {ready ? (
                <Link to={m.path} className={styles.launchCard}>{body}</Link>
              ) : (
                <div className={`${styles.launchCard} ${styles.launchPlanned}`} aria-disabled="true">
                  {body}
                  <span className="sr-only">Available in Phase {m.phase}.</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecentActivity({ items }) {
  if (!items.length) {
    return (
      <EmptyState icon={Clock} title="No activity yet">
        Experiments you run, quizzes you take and projects you create will appear here as a timeline.
      </EmptyState>
    );
  }
  return (
    <ol className={styles.timeline}>
      {items.map((a, i) => {
        const Icon = ACTIVITY_ICONS[a.kind] ?? FlaskConical;
        return (
          <li key={`${a.kind}-${a.at}-${i}`} className={styles.timelineItem}>
            <span className={styles.timelineIcon}><Icon size={14} aria-hidden="true" /></span>
            <div className={styles.timelineBody}>
              <p className={styles.timelineTitle}>{a.title}</p>
              <p className={styles.timelineMeta}>
                <span className={styles.capitalize}>{a.kind}</span> · {a.module}
                {a.status && <> · <span className={a.status === 'error' ? styles.textDanger : ''}>{a.status}</span></>}
              </p>
            </div>
            <time className={styles.timelineTime} dateTime={a.at}>{relativeTime(a.at)}</time>
          </li>
        );
      })}
    </ol>
  );
}

function ConceptProgress({ progress }) {
  return (
    <ul className={styles.progressList}>
      {progress.map((p) => (
        <li key={p.category} className={styles.progressItem}>
          <div className={styles.progressLabel}>
            <span>{CATEGORY_LABELS[p.category] ?? p.category}</span>
            <span className={styles.progressValue}>{p.mastery}%</span>
          </div>
          <ProgressBar value={p.mastery} label={`${CATEGORY_LABELS[p.category]} mastery`} />
          <p className={styles.progressMeta}>{p.concepts} concept{p.concepts === 1 ? '' : 's'}</p>
        </li>
      ))}
    </ul>
  );
}

function RecentProjects({ projects }) {
  if (!projects.length) {
    return (
      <EmptyState icon={FolderKanban} title="No projects yet">
        Save work from the Web Playground, Canvas Studio or JSX Playground and it will be listed here.
      </EmptyState>
    );
  }
  return (
    <ul className={styles.rowList}>
      {projects.map((p) => (
        <li key={p.id} className={styles.row}>
          <span className={styles.rowTitle}>{p.title}</span>
          <Badge>{p.type}</Badge>
          <time className={styles.rowTime} dateTime={p.updatedAt}>{relativeTime(p.updatedAt)}</time>
        </li>
      ))}
    </ul>
  );
}

function RecentTraces({ traces }) {
  if (!traces.length) {
    return (
      <EmptyState icon={Waypoints} title="No execution traces yet">
        Every traced operation, from a click to the database and back, is recorded here with its timing.
      </EmptyState>
    );
  }
  return (
    <ul className={styles.rowList}>
      {traces.map((t) => (
        <li key={t.traceId} className={styles.row}>
          <span className={`${styles.statusDot} ${t.status === 'error' ? styles.statusError : ''}`} aria-label={t.status} />
          <span className={styles.rowTitle}>{t.label}</span>
          <span className={styles.rowMeta}>{t.steps} steps · {formatMs(t.totalMs)}</span>
          <time className={styles.rowTime} dateTime={t.createdAt}>{relativeTime(t.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, status, error, reload } = useApi((signal) => api.get('/stats/dashboard', { signal }), []);

  const totals = data?.totals;
  const completionPct = totals?.experimentsAvailable
    ? Math.round((totals.experimentsCompleted / totals.experimentsAvailable) * 100)
    : 0;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="dashboard-title">
        <div>
          <p className={styles.eyebrow}>Interactive Web Development Environment</p>
          <h1 id="dashboard-title" className={styles.heroTitle}>
            {greeting()}, {firstName(user?.name)}
          </h1>
          <p className={styles.heroText}>
            Pick a laboratory, run an experiment, then follow it through every layer of the stack.
          </p>
        </div>
      </section>

      {status === 'error' && !data ? (
        <Card><ErrorState title="Could not load your dashboard" error={error} onRetry={reload} /></Card>
      ) : (
        <>
          <section className={styles.stats} aria-label="Your statistics" aria-busy={status === 'loading'}>
            <StatTile
              icon={FlaskConical}
              label="Experiments completed"
              value={totals ? `${totals.experimentsCompleted} / ${totals.experimentsAvailable}` : '—'}
              detail={totals ? `${totals.totalRuns} total runs` : 'Loading…'}
            >
              <ProgressBar value={completionPct} label="Experiments completed" />
            </StatTile>
            <StatTile icon={FolderKanban} label="Projects" value={totals?.projects ?? '—'} detail="Saved experiments" />
            <StatTile
              icon={GraduationCap}
              label="Assessments"
              value={totals?.assessments ?? '—'}
              detail={totals?.averageScore != null ? `Average score ${totals.averageScore}%` : 'No attempts yet'}
            />
            <StatTile icon={Waypoints} label="Execution traces" value={totals?.traces ?? '—'} detail="Recorded operations" />
          </section>

          <QuickLaunch />

          {status === 'loading' && !data ? (
            <Card><LoadingState label="Loading your activity…" /></Card>
          ) : data && (
            <div className={styles.columns}>
              <Card title="Recent activity" icon={Clock}
                actions={<Button size="sm" variant="ghost" onClick={reload} loading={status === 'loading'}>Refresh</Button>}>
                <RecentActivity items={data.recentActivity} />
              </Card>
              <Card title="Concept progress" icon={Gauge}>
                <ConceptProgress progress={data.progress} />
              </Card>
              <Card title="Recent projects" icon={Layers}>
                <RecentProjects projects={data.recentProjects} />
              </Card>
              <Card title="Execution history" icon={Waypoints}>
                <RecentTraces traces={data.recentTraces} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
