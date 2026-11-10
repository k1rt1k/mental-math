// Weekly summary data (pure, no DOM): the last seven days (today included) against the seven before, from the sessions already on this device.
import { S } from './state.js';
import { IDS, SK } from './engine.js';
import { esc, ymd, dayAgo } from './util.js';
import { streak, lvAgo, days, modeLabel } from './stats.js';

const DAY = 864e5;
const sum = (xs, f) => xs.reduce((q, x) => q + f(x), 0);
/** Pure: the numbers behind the card. `now` is a parameter so tests can fix the date. */
export function weekData(now = Date.now()) {
  const inR = (a, b) => S.sessions.filter((s) => s.t >= now - b * DAY && s.t < now - a * DAY);
  const cur = inR(0, 7), prev = inR(7, 14);
  const stat = (x) => { const n = sum(x, (s) => s.n), ok = sum(x, (s) => s.ok); return { sessions: x.length, n, acc: n ? Math.round((100 * ok) / n) : 0, min: Math.round(sum(x, (s) => s.dur) / 60) }; };
  const c = stat(cur), p = stat(prev);
  const days = new Set(cur.map((s) => ymd(s.t))).size;
  const gains = IDS.map((k) => [k, (S.sk[k].lv - lvAgo(k, 7)) * 100]).sort((a, b) => b[1] - a[1]);
  const dly = Object.entries(S.daily || {}).filter(([d]) => d >= ymd(now - 6 * DAY) && d <= ymd(now)).map(([d, v]) => [d, v]).sort((a, b) => b[1] - a[1])[0];
  const fl = cur.filter((s) => s.m == 'flash'), es = cur.filter((s) => s.m == 'est');
  return { empty: !cur.length, ...c, prev: p, days, streak: streak(), gain: gains[0] && gains[0][1] >= 1 ? { id: gains[0][0], by: Math.round(gains[0][1]) } : null, daily: dly ? { day: dly[0], pts: dly[1] } : null, flash: fl.length ? { runs: fl.length, best: Math.max(...fl.map((s) => s.pts)) } : null, est: es.length ? { runs: es.length, best: Math.max(...es.map((s) => s.pts)) } : null };
}
/** What the AI is told about the week, in the shape the `week` action expects: the same numbers the This week sheet shows. Pure; `now` is a parameter so tests can fix the date. */
export function weekAiContext(now = Date.now()) {
  const W = weekData(now), D = weekDays(now), DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const modes = {};
  S.sessions.filter((s) => s.t >= now - 7 * DAY && s.t <= now).forEach((s) => { const m = modeLabel(s.m); modes[m] = (modes[m] || 0) + 1; });
  return {
    daysPracticed: W.days, sessions: W.sessions, answers: W.n, accuracyPct: W.acc, minutes: W.min, streakDays: W.streak,
    ...(W.prev.sessions > 0 ? { lastWeek: { sessions: W.prev.sessions, answers: W.prev.n, accuracyPct: W.prev.acc, minutes: W.prev.min } } : {}),
    perDay: D.map((d) => ({ day: DOW[new Date(d.t).getDay()] + (d.today ? ' (today)' : ''), answers: d.n, accuracyPct: d.n ? d.acc : null })),
    biggestGain: W.gain ? { skill: SK[W.gain.id].n, by: W.gain.by } : null,
    bestDaily: W.daily ? { points: W.daily.pts } : null,
    modes,
  };
}
/** One calendar day ('YYYY-MM-DD'): its sessions and totals. `D` is the set of practised days, passed in so a loop does not rebuild it. */
export function dayInfo(k, now = Date.now(), D = days()) {
  const t = new Date(k + 'T12:00:00').getTime(), ss = S.sessions.filter((s) => ymd(s.t) == k).sort((a, b) => a.t - b.t);
  const n = ss.reduce((q, s) => q + s.n, 0), ok = ss.reduce((q, s) => q + s.ok, 0), i = Math.round((dayAgo(0, now) - t) / DAY);
  return { i, t, k, on: D.has(k), today: i == 0, sessions: ss, n, acc: n ? Math.round((100 * ok) / n) : 0, min: Math.round(ss.reduce((q, s) => q + s.dur, 0) / 60), pts: ss.reduce((q, s) => q + (s.pts || 0), 0) };
}
/** The seven calendar days ending today, oldest first. */
export function weekDays(now = Date.now()) {
  const D = days();
  return [6, 5, 4, 3, 2, 1, 0].map((i) => dayInfo(ymd(dayAgo(i, now)), now, D));
}
export const sgn = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
export function weekLines(w) {
  if (w.empty) return [];
  const L = [`${w.days} of 7 days practised${w.streak ? ', ' + w.streak + '-day streak' : ''}`, `${w.sessions} session${w.sessions == 1 ? '' : 's'}, ${w.n} answers, ${w.min} min`, `Accuracy ${w.acc}%${w.prev.sessions ? ' (' + sgn(w.acc - w.prev.acc) + ' vs last week)' : ''}`];
  if (w.gain) L.push(`Biggest gain: ${SK[w.gain.id].n} +${w.gain.by}`);
  if (w.daily) L.push(`Best Daily: ${w.daily.pts} pts`);
  if (w.flash) L.push(`Flash: ${w.flash.runs} run${w.flash.runs == 1 ? '' : 's'}, best ${w.flash.best} pts`);
  if (w.est) L.push(`Estimate: ${w.est.runs} run${w.est.runs == 1 ? '' : 's'}, best ${w.est.best} pts`);
  return L;
}
export const weekText = (w) => (w.empty ? '' : 'My week in Mental Math\n' + weekLines(w).join('\n'));

