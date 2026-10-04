const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** MySQL "YYYY-MM-DD HH:MM:SS" (server local time) or ISO string → "5 minutes ago". */
export function relativeTime(value, now = Date.now()) {
  if (!value) return '—';
  const date = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatMs(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || 'there';
}
