import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderKanban, FolderOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { projectsApi, toFileList } from '../../services/projects.js';
import { DEFAULT_TEMPLATE_ID, FILE_ORDER, templateById } from '../../modules/web-playground/templates.js';
import { EXAMPLES } from '../../modules/component-studio/jsx/examples.jsx';
import { relativeTime } from '../../utils/format.js';
import { PROJECT_TYPES } from './projectTypes.js';
import styles from './ProjectsPage.module.css';

const FILTERS = [['all', 'All'], ['web', 'Web'], ['canvas', 'Canvas'], ['jsx', 'JSX']];

const formatSize = (chars) => (chars < 1024 ? `${chars} B` : chars < 1048576 ? `${(chars / 1024).toFixed(1)} KB` : `${(chars / 1048576).toFixed(1)} MB`);

/** A blank white drawing the size Canvas Studio uses. */
function blankPng() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 960, height: 600 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Real starting content for each project type. */
function starterFiles(type) {
  if (type === 'web') return toFileList(templateById(DEFAULT_TEMPLATE_ID).files, FILE_ORDER);
  if (type === 'canvas') return [{ filename: 'drawing.png', content: blankPng() }];
  return [{ filename: `${EXAMPLES[0].id}.jsx`, content: EXAMPLES[0].code }];
}

export default function ProjectsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const list = useApi((signal) => projectsApi.list({ signal }), []);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // { mode: 'new'|'rename'|'delete', project?, title, description, type, busy, error }

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list.data ?? []).filter((p) => (filter === 'all' || p.type === filter)
      && (!q || p.title.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)));
  }, [list.data, filter, query]);
  const counts = useMemo(() => (list.data ?? []).reduce((acc, p) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }), {}), [list.data]);

  const close = () => setDialog(null);
  const patch = (p) => setDialog((d) => ({ ...d, ...p }));

  async function submit(e) {
    e?.preventDefault();
    const { mode, project, title, description, type } = dialog;
    if (mode !== 'delete' && !title.trim()) {
      patch({ error: 'Give the project a title.' });
      return;
    }
    patch({ busy: true, error: null });
    try {
      if (mode === 'new') {
        const created = await projectsApi.create({ title: title.trim(), type, description: description.trim() || null, files: starterFiles(type) });
        toast.success(`Created "${created.title}".`);
        navigate(PROJECT_TYPES[type].open(created.id));
        return;
      }
      if (mode === 'rename') {
        await projectsApi.rename(project.id, title.trim(), description.trim() || null);
        toast.success('Project updated.');
      } else {
        await projectsApi.remove(project.id);
        toast.success(`Deleted "${project.title}".`);
      }
      close();
      list.reload();
    } catch (err) {
      patch({ busy: false, error: err.fields?.title ?? err.fields?.description ?? err.message });
    }
  }

  return (
    <div className={styles.page}>
      <LabHeader
        icon={FolderKanban}
        layer="database"
        title="Projects"
        description="Everything you saved from the Web Playground, Canvas Studio and the JSX Playground. Open a project to keep working on it in its lab."
        actions={<Button variant="primary" icon={Plus} onClick={() => setDialog({ mode: 'new', title: '', description: '', type: 'web' })}>New project</Button>}
      />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={15} aria-hidden="true" />
          <label className="sr-only" htmlFor="project-search">Search projects</label>
          <input id="project-search" type="search" placeholder="Search by title or description" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className={styles.filters} role="radiogroup" aria-label="Project type">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}>
              {label} <span>{id === 'all' ? list.data?.length ?? 0 : counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {list.status === 'loading' && !list.data ? <LoadingState label="Loading projects…" />
        : list.status === 'error' ? <ErrorState error={list.error} onRetry={list.reload} />
          : projects.length === 0 ? (
            <Card>
              <EmptyState icon={FolderKanban} title={list.data.length ? 'No projects match' : 'No projects yet'}
                action={!list.data.length && <Button icon={Plus} onClick={() => setDialog({ mode: 'new', title: '', description: '', type: 'web' })}>Create your first project</Button>}>
                {list.data.length ? 'Try another search or type.' : 'Save your work from a lab, or start a new project here.'}
              </EmptyState>
            </Card>
          ) : (
            <ul className={styles.grid} aria-label="Projects">
              {projects.map((p) => {
                const t = PROJECT_TYPES[p.type];
                return (
                  <li key={p.id} className={styles.card} style={{ '--type': `var(--layer-${p.type === 'web' ? 'render' : p.type === 'canvas' ? 'dom' : 'state'})` }}>
                    <div className={styles.cardHead}>
                      <span className={styles.typeIcon}><t.icon size={18} aria-hidden="true" /></span>
                      <div className={styles.cardTitle}>
                        <h2><Link to={t.open(p.id)}>{p.title}</Link></h2>
                        <Badge>{t.label}</Badge>
                      </div>
                    </div>
                    <p className={p.description ? styles.description : styles.noDescription}>{p.description || 'No description'}</p>
                    <p className={styles.meta}>
                      {p.fileCount} file{p.fileCount === 1 ? '' : 's'} · {formatSize(p.sizeChars)} · updated <time dateTime={p.updatedAt}>{relativeTime(p.updatedAt)}</time>
                    </p>
                    <div className={styles.actions}>
                      <Button size="sm" variant="primary" icon={FolderOpen} onClick={() => navigate(t.open(p.id))}>Open in {t.lab}</Button>
                      <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Rename ${p.title}`}
                        onClick={() => setDialog({ mode: 'rename', project: p, title: p.title, description: p.description ?? '' })}>Rename</Button>
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${p.title}`} onClick={() => setDialog({ mode: 'delete', project: p })} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

      <Modal open={dialog?.mode === 'new' || dialog?.mode === 'rename'} onClose={close}
        title={dialog?.mode === 'new' ? 'New project' : 'Rename project'}
        footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={dialog?.busy} onClick={submit}>{dialog?.mode === 'new' ? 'Create and open' : 'Save'}</Button></>}>
        {dialog && dialog.mode !== 'delete' && (
          <form className={styles.form} onSubmit={submit} noValidate>
            <TextField label="Title" value={dialog.title} maxLength={120} onChange={(e) => patch({ title: e.target.value })} error={dialog.error} autoFocus />
            <TextField label="Description (optional)" value={dialog.description} maxLength={500} onChange={(e) => patch({ description: e.target.value })} />
            {dialog.mode === 'new' && (
              <fieldset className={styles.types}>
                <legend>Type</legend>
                {Object.entries(PROJECT_TYPES).map(([id, t]) => (
                  <label key={id} className={dialog.type === id ? styles.typeChosen : undefined}>
                    <input type="radio" name="type" value={id} checked={dialog.type === id} onChange={() => patch({ type: id })} />
                    <t.icon size={16} aria-hidden="true" />
                    <span><strong>{t.label}</strong><small>opens in {t.lab}</small></span>
                  </label>
                ))}
              </fieldset>
            )}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </Modal>

      <Modal open={dialog?.mode === 'delete'} onClose={close} title="Delete this project?" size="sm"
        description={dialog?.project ? `"${dialog.project.title}" and its ${dialog.project.fileCount} file(s) will be removed permanently.` : ''}
        footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" loading={dialog?.busy} onClick={submit}>Delete</Button></>}>
        {dialog?.error && <p className={styles.error}>{dialog.error}</p>}
      </Modal>
    </div>
  );
}
