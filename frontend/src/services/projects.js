import { api } from './apiClient.js';

/** Project files travel as an ordered list; the UI works with a filename → content map. */
export const toFileList = (files, order) =>
  order.filter((name) => name in files).map((filename) => ({ filename, content: files[filename] }));

export const toFileMap = (list) => Object.fromEntries(list.map((f) => [f.filename, f.content]));

export const projectsApi = {
  list: (opts) => api.get('/projects', opts),
  get: (id, opts) => api.get(`/projects/${id}`, opts),
  create: (project) => api.post('/projects', project, { source: 'projects' }),
  save: (id, project) => api.put(`/projects/${id}`, project, { source: 'projects' }),
  rename: (id, title, description) => api.patch(`/projects/${id}`, { title, description }, { source: 'projects' }),
  remove: (id) => api.delete(`/projects/${id}`, { source: 'projects' }),
};
