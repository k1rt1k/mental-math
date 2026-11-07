// Small shared helpers. No app state in here.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const ri = (a, b, R = Math.random) => a + Math.floor(R() * (b - a + 1));
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
/** Piecewise-linear lookup over a 12-point difficulty table. */
export const lerp = (A, d) => {
  const i = clamp(d, 1, 12) - 1, lo = Math.floor(i);
  return A[lo] + (A[Math.min(lo + 1, A.length - 1)] - A[lo]) * (i - lo);
};
export const ymd = (t = Date.now()) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
/** Local noon, `i` calendar days before `from`. Stepping calendar days (not 24-hour blocks) keeps dates right across DST changes. */
export const dayAgo = (i = 0, from = Date.now()) => { const d = new Date(from); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); return d.getTime(); };
export const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
/** Deterministic seeded RNG (mulberry32), used for the Daily challenge. */
export const seeded = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const fmtLen = (d) => (!d ? 'Untimed' : d < 120 ? d + 's' : d / 60 + ' min');
export const ago = (t) => {
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 36) return h + ' h ago';
  return Math.round(h / 24) + ' days ago';
};

/** Shown in the footer. Keep in step with the cache name in sw.js (a test enforces this). */
export const VERSION = '14.73';
/** "due now" / "due in 40 min" / "due in 3 days" for a spaced-review timestamp. */
export const dueIn = (t, now = Date.now()) => {
  const m = Math.round((t - now) / 6e4);
  if (m <= 0) return 'due now';
  if (m < 60) return 'due in ' + m + ' min';
  const h = Math.round(m / 60);
  return h < 36 ? 'due in ' + h + ' h' : 'due in ' + Math.round(h / 24) + ' days';
};
