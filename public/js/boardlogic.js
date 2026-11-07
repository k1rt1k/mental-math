// Daily leaderboard, pure logic: the offline retry queue and the rank-change summary. No DOM, no storage, so it is testable on its own.

/** How many days a queued score is kept. The server only takes a day within one day of its own date, so older ones could never be sent. */
export const QUEUE_DAYS = 2;
export const QUEUE_MAX = 4;

const dayNum = (d) => Date.parse(d + 'T00:00:00Z');
const okDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && Number.isFinite(dayNum(d));

/** Drop entries that are malformed or too old to be accepted. `today` is a local YYYY-MM-DD. */
export function queueClean(q, today) {
  const t = dayNum(today);
  return (Array.isArray(q) ? q : []).filter((x) => x && okDay(x.day) && Number.isInteger(x.pts) && Number.isInteger(x.n) && Number.isInteger(x.ok) && t - dayNum(x.day) <= QUEUE_DAYS * 864e5).slice(-QUEUE_MAX);
}
/** Add a finished Daily. One entry per day, and the day's best points win (the server keeps the best too). */
export function queueAdd(q, e, today) {
  const rest = queueClean(q, today), i = rest.findIndex((x) => x.day === e.day), item = { day: e.day, pts: Math.round(e.pts), n: e.n, ok: e.ok };
  if (i < 0) return queueClean([...rest, item], today);
  if (rest[i].pts < item.pts) rest[i] = item;
  return rest;
}
export const queueDrop = (q, day) => (Array.isArray(q) ? q : []).filter((x) => x.day !== day);

/**
 * What changed for this learner between two reads of the same day's board.
 * Returns null when there is nothing to celebrate (not on the board, or no better place than before).
 * { rank, prev (null when first listed), up, passed: names now behind you who were ahead of you, first }
 */
export function rankChange(before, after) {
  const ai = (after || []).findIndex((x) => x.you);
  if (ai < 0) return null;
  const bi = (before || []).findIndex((x) => x.you), prev = bi < 0 ? null : bi + 1, rank = ai + 1;
  if (prev !== null && rank >= prev) return null;
  const behind = new Set(after.slice(ai + 1).map((x) => x.name));
  const passed = (before || []).slice(0, bi < 0 ? undefined : bi).map((x) => x.name).filter((n) => behind.has(n));
  return { rank, prev, up: prev === null ? 0 : prev - rank, passed, first: rank === 1 };
}

const list = (a) => (a.length < 2 ? a.join('') : a.length == 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
/** One line for the banner. Names are plain text: escape when putting into HTML. */
export function moveText(m) {
  if (!m) return '';
  const who = m.passed.length ? 'You passed ' + list(m.passed) : '';
  if (m.prev === null) return m.first ? (who ? who + '. You lead today' : 'You lead today') : who ? who + '. You are #' + m.rank : 'You are on the board at #' + m.rank;
  return (who || 'You moved up') + (m.first ? '. You lead today' : ' · up ' + m.up + (m.up == 1 ? ' place' : ' places') + ' to #' + m.rank);
}
/** "Today you are #2 of 4", or '' when this learner has no score on today's board. */
export function rankLine(b) {
  const i = b && Array.isArray(b.board) ? b.board.findIndex((x) => x.you) : -1;
  return i < 0 ? '' : 'Today you are #' + (i + 1) + ' of ' + b.board.length + '.';
}
