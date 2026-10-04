import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { DEFAULT_TEMPLATE_ID, FILE_ORDER, templateById } from './templates.js';

const DRAFT_KEY = 'webforge.playground.draft';

const signature = (title, files) => JSON.stringify([title, FILE_ORDER.map((f) => files[f] ?? '')]);

function fromTemplate(templateId) {
  const template = templateById(templateId);
  return {
    files: { ...template.files },
    baseline: { ...template.files }, // what "modified" markers compare against
    active: 'index.html',
    title: template.title,
    templateId: template.id,
    project: null,                    // { id, title, updatedAt } once saved
    savedSignature: null,
  };
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (draft && typeof draft.files?.['index.html'] === 'string') return draft;
  } catch {
    /* no usable draft */
  }
  return null;
}

function initialState() {
  const draft = readDraft();
  if (!draft) return fromTemplate(DEFAULT_TEMPLATE_ID);
  const base = fromTemplate(draft.templateId ?? DEFAULT_TEMPLATE_ID);
  return { ...base, files: { ...base.files, ...draft.files }, title: draft.title ?? base.title };
}

function reducer(state, action) {
  switch (action.type) {
    case 'edit':
      return { ...state, files: { ...state.files, [action.file]: action.content } };
    case 'select':
      return { ...state, active: action.file };
    case 'template':
      return fromTemplate(action.templateId);
    case 'loadProject': {
      const { project, files } = action;
      return {
        ...fromTemplate(DEFAULT_TEMPLATE_ID),
        files: { ...files },
        baseline: { ...files },
        title: project.title,
        templateId: null,
        project: { id: project.id, title: project.title, updatedAt: project.updatedAt },
        savedSignature: signature(project.title, files),
      };
    }
    case 'saved': {
      const { project } = action;
      return {
        ...state,
        title: project.title,
        baseline: { ...state.files },
        project: { id: project.id, title: project.title, updatedAt: project.updatedAt },
        savedSignature: signature(project.title, state.files),
      };
    }
    case 'revert':
      return { ...state, files: { ...state.baseline }, title: state.project?.title ?? state.title };
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

/** All editor state for the Web Playground: files, active file, project linkage and dirtiness. */
export function usePlaygroundState() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const dirty = state.project
    ? signature(state.title, state.files) !== state.savedSignature
    : FILE_ORDER.some((f) => state.files[f] !== state.baseline[f]);

  const modifiedFiles = useMemo(
    () => new Set(FILE_ORDER.filter((f) => state.files[f] !== state.baseline[f])),
    [state.files, state.baseline],
  );

  // Unsaved scratch work survives reloads as a local draft.
  useEffect(() => {
    if (state.project) return undefined;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ files: state.files, title: state.title, templateId: state.templateId }));
      } catch {
        /* storage full or blocked: the draft is a convenience only */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [state.files, state.title, state.templateId, state.project]);

  const actions = useMemo(() => ({
    edit: (file, content) => dispatch({ type: 'edit', file, content }),
    select: (file) => dispatch({ type: 'select', file }),
    useTemplate: (templateId) => dispatch({ type: 'template', templateId }),
    loadProject: (project, files) => dispatch({ type: 'loadProject', project, files }),
    markSaved: (project) => dispatch({ type: 'saved', project }),
    revert: () => dispatch({ type: 'revert' }),
  }), []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { state, dirty, modifiedFiles, actions, clearDraft };
}
