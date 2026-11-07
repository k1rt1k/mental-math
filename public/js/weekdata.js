// Weekly summary data (pure, no DOM): the last seven days (today included) against the seven before, from the sessions already on this device.
import { S } from './state.js';
import { IDS, SK } from './engine.js';
import { esc, ymd, dayAgo } from './util.js';
import { streak, lvAgo } from './stats.js';

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
  const fl = cur.filter((s) => s.m == 'flash');
  return { empty: !cur.length, ...c, prev: p, days, streak: streak(), gain: gains[0] && gains[0][1] >= 1 ? { id: gains[0][0], by: Math.round(gains[0][1]) } : null, daily: dly ? { day: dly[0], pts: dly[1] } : null, flash: fl.length ? { runs: fl.length, best: Math.max(...fl.map((s) => s.pts)) } : null };
}
export const sgn = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
export function weekLines(w) {
  if (w.empty) return [];
  const L = [`${w.days} of 7 days practised${w.streak ? ', ' + w.streak + '-day streak' : ''}`, `${w.sessions} session${w.sessions == 1 ? '' : 's'}, ${w.n} answers, ${w.min} min`, `Accuracy ${w.acc}%${w.prev.sessions ? ' (' + sgn(w.acc - w.prev.acc) + ' vs last week)' : ''}`];
  if (w.gain) L.push(`Biggest gain: ${SK[w.gain.id].n} +${w.gain.by}`);
  if (w.daily) L.push(`Best Daily: ${w.daily.pts} pts`);
  if (w.flash) L.push(`Flash: ${w.flash.runs} run${w.flash.runs == 1 ? '' : 's'}, best ${w.flash.best} pts`);
  return L;
}
export const weekText = (w) => (w.empty ? '' : 'My week in Mental Math\n' + weekLines(w).join('\n'));

