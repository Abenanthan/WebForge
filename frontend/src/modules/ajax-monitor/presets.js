/** Ready-made requests against the real demo endpoints (backend/src/Controllers/DemoController.php). */
export const PRESETS = [
  { id: 'get', label: 'GET with query', method: 'GET', path: 'echo', query: [['course', 'web'], ['week', '5']], body: '' },
  { id: 'post', label: 'POST JSON', method: 'POST', path: 'echo', query: [], body: '{\n  "name": "Asha",\n  "skills": ["html", "css", "js"]\n}' },
  { id: 'search', label: 'Search the database', method: 'GET', path: 'concepts', query: [['search', 'java'], ['limit', '5']], body: '' },
  { id: 'slow', label: 'Slow request', method: 'GET', path: 'concepts', query: [['category', 'react']], body: '', delay: 1500 },
  { id: 'put', label: 'PUT update', method: 'PUT', path: 'echo', query: [], body: '{\n  "id": 7,\n  "title": "Updated title"\n}' },
  { id: 'delete', label: 'DELETE', method: 'DELETE', path: 'echo', query: [['id', '7']], body: '' },
  { id: 'notfound', label: '404 Not Found', method: 'GET', path: 'status/404', query: [], body: '' },
  { id: 'error', label: '500 Server error', method: 'GET', path: 'echo', query: [], body: '', fail: true },
];

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
export const PATH_PATTERN = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

/** Build "/demo/<path>?<query>" from the builder state (delay/fail become real query parameters). */
export function buildPath({ path, query, delay, fail }) {
  const params = new URLSearchParams();
  query.filter(([k]) => k.trim()).forEach(([k, v]) => params.append(k.trim(), v));
  if (delay > 0) params.set('delay', String(delay));
  if (fail) params.set('fail', '1');
  const qs = params.toString();
  return `/demo/${path}${qs ? `?${qs}` : ''}`;
}

/** The fetch() call a developer would write for the same request. */
export function fetchSnippet(method, url, body) {
  const lines = [
    'async function sendRequest() {',
    `  const response = await fetch('${url}', {`,
    `    method: '${method}',`,
    '    headers: {',
    "      'Accept': 'application/json',",
    ...(body ? ["      'Content-Type': 'application/json',"] : []),
    ...(method !== 'GET' ? ["      'X-CSRF-Token': csrfToken,   // required for state-changing requests"] : []),
    '    },',
    "    credentials: 'same-origin',   // send the session cookie",
    ...(body ? [`    body: JSON.stringify(${body.trim().replace(/\n/g, '\n    ')}),`] : []),
    '  });',
    '  const json = await response.json();',
    '  if (!response.ok) {',
    '    throw new Error(json.error.message);   // 4xx / 5xx still resolve; check response.ok',
    '  }',
    '  return json.data;',
    '}',
  ];
  return lines.join('\n');
}
