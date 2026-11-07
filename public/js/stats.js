// Read-only statistics derived from state: streaks, weekly comparisons, milestones, coaching text.
import { S, avgLv, RECALL_GAP } from './state.js';
import { IDS, SK, SH, weakness, zetaEstimate } from './engine.js';
import { TRICKS } from './tricks.js';
import { ymd, dayAgo } from './util.js';

const DAY = 864e5;
export const days = () => new Set(S.sessions.filter((s) => s.ok > 0).map((s) => ymd(s.t)));   // a day counts once something was answered correctly

/**
 * Streak rule: one rest day is forgiven only after 7 consecutive practised days (counted since the previous forgiven day).
 * For every practised day: c = streak length ending there (the forgiven rest day itself is not counted),
 * since = practised days in a row since the last forgiven rest day (or the start of the run).
 */
function runs(D) {
  const out = new Map();
  let c = 0, since = 0, prev = null;
  for (const s of [...D].sort()) {
    if (prev !== null && ymd(dayAgo(-1, prev)) == s) { c++; since++; }
    else if (prev !== null && ymd(dayAgo(-2, prev)) == s && since >= 7) { c++; since = 1; }   // exactly one rest day, earned by 7 in a row
    else { c = 1; since = 1; }
    out.set(s, { c, since });
    prev = new Date(s + 'T12:00').getTime();
  }
  return out;
}

/**
 * Current streak. Not having practised yet today never breaks it (the day is not over).
 * A rest day yesterday keeps it alive only if that rest day was earned (7 in a row before it); practising today then continues the streak.
 */
export function streak() {
  const R = runs(days());
  const today = dayAgo(0), y = dayAgo(1, today);
  const at = (t) => R.get(ymd(t));
  if (at(today)) return at(today).c;
  if (at(y)) return at(y).c;
  const e = at(dayAgo(2, today));
  return e && e.since >= 7 ? e.c : 0;
}

/**
 * Where the rest-day allowance stands: { state: 'ready' | 'using' | 'earning', left } or null when there is no streak.
 * ready = one missed day would be forgiven; using = yesterday was the rest day, so play today; earning = left more days in a row to earn one.
 */
export function restInfo() {
  if (!streak()) return null;
  const R = runs(days()), today = dayAgo(0), y = dayAgo(1, today), at = (t) => R.get(ymd(t));
  const cur = at(today) || at(y);
  if (!cur) return { state: 'using', left: 0 };
  return cur.since >= 7 ? { state: 'ready', left: 0 } : { state: 'earning', left: 7 - cur.since };
}

/** Best streak ever, by the same rule as the current one (so it is never shorter than the streak you are on). */
export function longest() {
  let best = 0;
  runs(days()).forEach((r) => { if (r.c > best) best = r.c; });
  return best;
}

export function ctx() {
  const L = IDS.map((k) => S.sk[k].lv);
  return {
    ls: longest(),
    n: S.sessions.reduce((a, s) => a + s.n, 0),
    mx: Math.max(...L),
    mn: Math.min(...L),
    perf: S.sessions.some((s) => s.n >= 30 && (s.ft ?? s.ok) == s.n),   // perfect = every answer right on the first try
    dy: Object.keys(S.daily || {}).length,
    sv: Math.max(0, ...S.sessions.filter((s) => s.m == 'survival').map((s) => s.ok)),
    spt: S.best && S.best.sprint ? S.best.sprint.t : 9999,   // best Sprint time in seconds
  };
}

/** [id, label, test(ctx), hint] */
export const MS = [
  ['s3', '3-day streak', (c) => c.ls >= 3], ['s7', '7-day streak', (c) => c.ls >= 7], ['s14', '14-day streak', (c) => c.ls >= 14], ['s30', '30-day streak', (c) => c.ls >= 30],
  ['a1', '100 answers', (c) => c.n >= 100], ['a2', '1,000 answers', (c) => c.n >= 1e3], ['a3', '5,000 answers', (c) => c.n >= 5e3], ['a4', '20,000 answers', (c) => c.n >= 2e4],
  ['l6', 'A skill at rating 600', (c) => c.mx >= 6], ['l8', 'A skill at rating 800', (c) => c.mx >= 8], ['l10', 'A skill at rating 1000', (c) => c.mx >= 10], ['m6', 'Every skill ≥ 600', (c) => c.mn >= 6],
  ['d1', 'First Daily challenge', (c) => c.dy >= 1], ['d7', '7 Daily challenges', (c) => c.dy >= 7], ['d30', '30 Daily challenges', (c) => c.dy >= 30],
  ['sv20', 'Survival: 20 correct', (c) => c.sv >= 20], ['sv50', 'Survival: 50 correct', (c) => c.sv >= 50],
  ['pf', 'Perfect session (30+ answers)', (c) => c.perf],
  ['sp1', 'First Sprint', (c) => c.spt < 9999], ['sp60', 'Sprint under 60 s', (c) => c.spt <= 60], ['sp40', 'Sprint under 40 s', (c) => c.spt <= 40],
];

/** What the daily goal counts on the given day. One definition for Home, the plan and the recommendation. */
/** Does this run count toward the daily goal? 2+ minutes of practice, a completed Sprint (20 right) or a Survival run of 90 s+. Short or empty runs never do. */
export const countsToGoal = (x) => x.ok > 0 && (x.dur >= 120 || (x.m == 'sprint' && x.ok >= 20) || (x.m == 'survival' && x.dur >= 90));
export const todayCount = (now = Date.now()) => { const d = ymd(now); return S.sessions.filter((x) => ymd(x.t) == d && countsToGoal(x)).length; };

/** When do you play best? Sessions grouped by time of day: [label, sessions, accuracy %, points per minute]. Needs 3+ sessions in a slot to count. */
export const SLOTS = [['Morning', 5, 12], ['Afternoon', 12, 18], ['Evening', 18, 23], ['Night', 23, 29]];
export function hourStats() {
  const out = SLOTS.map(([l]) => ({ l, s: 0, n: 0, ok: 0, pm: 0 }));
  S.sessions.filter((x) => x.dur >= 60).forEach((x) => {
    let h = new Date(x.t).getHours(); if (h < 5) h += 24;
    const i = SLOTS.findIndex(([, a, b]) => h >= a && h < b), o = out[i < 0 ? 3 : i];
    o.s++; o.n += x.n; o.ok += x.ok; o.pm += (x.pts * 60) / x.dur;
  });
  const rows = out.map((o) => ({ l: o.l, s: o.s, acc: o.n ? Math.round((100 * o.ok) / o.n) : 0, pace: o.s ? Math.round(o.pm / o.s) : 0 }));
  const ok = rows.filter((r) => r.s >= 3), best = ok.length > 1 ? ok.slice().sort((a, b) => b.pace - a.pace)[0] : null;
  return { rows, best };
}

/** Personal records shown on Home. Each row: [label, value]. */
export function records() {
  const tr = S.sessions.filter((s) => s.m == 'train' && s.dur == 120), sv = S.best.survival, dv = Object.values(S.daily || {});
  const bestAcc = Math.max(0, ...S.sessions.filter((s) => s.n >= 20).map((s) => Math.round((100 * (s.ft ?? s.ok)) / s.n)));
  return [
    ['Best 2-min Train', tr.length ? Math.max(...tr.map((s) => s.pts)) + ' pts' : '–'],
    ['Best Survival', sv ? sv.n + ' correct · ' + sv.pts + ' pts' : '–'],
    ['Best Daily', dv.length ? Math.max(...dv) + ' pts' : '–'],
    ['Best Sprint (20 questions)', S.best.sprint ? S.best.sprint.t + ' s' : '–'],
    ['Best first-try accuracy (20+ answers)', bestAcc ? bestAcc + '%' : '–'],
    ['Longest streak', longest() + ' days'],
  ];
}

export function week(a, b) {
  const now = Date.now(), x = S.sessions.filter((s) => s.t >= now - b * DAY && s.t < now - a * DAY);
  const n = x.reduce((q, s) => q + s.n, 0), ok = x.reduce((q, s) => q + s.ok, 0), pc = x.reduce((q, s) => q + (s.pts * 60) / s.dur, 0);
  return { s: x.length, n, acc: n ? (100 * ok) / n : 0, pace: x.length ? pc / x.length : 0 };
}

/** Rating of a skill as of N days ago (from the per-session snapshots). */
export function lvAgo(k, d) {
  const old = S.sessions.filter((s) => s.t < Date.now() - d * DAY && s.lv && s.lv[k] != null).pop();
  return old ? old.lv[k] : SK[k].s;
}

export const strength = (k) => weakness(S.sk[k]);
export const weakestSkills = (n = 2) => IDS.slice().sort((a, b) => strength(b) - strength(a)).slice(0, n);

export const zDef = () => zetaEstimate(S.sk, ['add', 'sub', 'mul', 'div'], { add: 4.5, sub: 4.5, mul: 5, div: 5 });
export const zMD = () => zetaEstimate(S.sk, ['mul', 'div'], { mul: 5, div: 5 });

export function coach(e) {
  if (!e.ok) return 'Nothing was answered correctly this time. Press H on any question to see its method, or try the Learn tab.';
  const a = e.ok / e.n, clean = e.ft / e.n;   // clean = right first time; `a` counts a fixed slip as right
  const ws = IDS.filter((k) => e.by[k] && e.by[k][0] >= 3).map((k) => [k, e.by[k][1] / e.by[k][0], S.sk[k].spd]);
  const lo = ws.slice().sort((x, y) => x[1] - y[1])[0], sl = ws.slice().sort((x, y) => y[2] - x[2])[0];
  if (e.kind == 'sprint') return e.slips + e.skips == 0 ? 'Clean run: no penalties. The only way to go faster now is better methods: open Learn for your slowest skill.' : 'Each slip costs 3 s and each skip 5 s. ' + (e.slips + e.skips == 1 ? 'That one cost you ' : 'Those cost you ') + (3 * e.slips + 5 * e.skips) + ' s: accuracy is the cheapest way to a faster time.';
  if (e.kind == 'survival') return e.ok >= 20 ? 'Strong run. Survival ramps difficulty every answer, so the late questions are the real test.' : 'Survival rewards steady accuracy. A guess costs a life, so skip only when you are truly stuck.';
  if (a < 0.8 || clean < 0.7) return 'Only ' + Math.round(clean * 100) + '% were right first time. Slow down a touch: a wrong answer costs more than a second of thinking.' + (lo ? ' Most misses: ' + SK[lo[0]].n + '.' : '');
  if (clean > 0.96 && sl && sl[2] > 1.15) return 'Very clean session. You can afford to go faster, especially on ' + SK[sl[0]].n + '.';
  return lo && lo[1] < 0.9 ? 'Solid pace. Your weakest area this session was ' + SK[lo[0]].n + ' (' + Math.round(lo[1] * 100) + '% right).' : 'Balanced session. Keep hitting the daily goal and your ratings will climb.';
}

/** Human-readable name for a saved session's mode id (history table, detail dialog, AI context). */
const MODE_LABEL = { train: 'Train', focus: 'Focus', zeta: 'Custom ranges', daily: 'Daily challenge', survival: 'Survival', review: 'Review', sprint: 'Sprint' };
export const modeLabel = (m) => MODE_LABEL[m] || 'Train';

export const shareLine = (r) => {
  // A focus run is a per-run drill: the saved config may still say "all skills", so prefer the one
  // skill that actually appears in the saved run before falling back to it.
  const by = r.by && Object.keys(r.by).filter((k) => r.by[k] && r.by[k][0]);
  const focus = r.m == 'focus' && by && by.length == 1 ? by[0] : (S.cfg || {}).only;
  const nm = r.m == 'review' ? 'Review' : r.m == 'daily' ? 'Daily challenge' : r.m == 'survival' ? 'Survival' : r.m == 'sprint' ? 'Sprint 20' : r.m == 'zeta' ? 'Custom ranges' : (r.m == 'focus' ? (SK[focus] || { n: 'Focus' }).n : 'Train') + ' ' + r.dur + 's';
  return `Mental Math ${ymd(r.t)} · ${nm} · ${r.ok} correct · ${Math.round((100 * r.ok) / Math.max(1, r.n))}% · ${r.pts} pts · ${r.tm}s avg · ${streak()}-day streak`;
};
export { SH };

/**
 * What should you do right now? One clear suggestion, in priority order:
 * first session → due reviews → today's goal → daily challenge → survival.
 * Returns { kind, act, title, why, cta } where `act` is a data-act name handled by the home view.
 */
export function recommend(now = Date.now()) {
  const has = S.sessions.length > 0, goal = S.goal || 2, today = ymd(now);
  const td = todayCount(now);
  const due = Object.values(S.weak).filter((w) => w.due <= now).length;
  const [w1, w2] = weakestSkills(2);
  if (!has) return { kind: 'first', act: 'recommended', title: 'Take your first 2\u2011minute session', why: 'It sets your starting ratings and your first ghost to race against.', cta: 'Start' };
  if (due >= 5) return { kind: 'review', act: 'review', title: 'Review ' + Math.min(due, 20) + ' missed questions', why: 'They are due now. Spaced review is the fastest way to stop repeating a mistake.', cta: 'Start review' };
  if (td < goal) return { kind: 'train', act: 'recommended', title: td ? 'One more 2\u2011minute session' : 'Today’s 2\u2011minute session', why: 'Extra focus on ' + SK[w1].n + ' and ' + SK[w2].n + ', your weakest right now. ' + td + ' of ' + goal + ' sessions done today.', cta: 'Start 2 min' };
  if (!(S.daily && S.daily[today])) return { kind: 'daily', act: 'daily', title: 'Daily challenge', why: 'Goal done. 60 seconds, same questions for everyone today.', cta: 'Play daily' };
  return { kind: 'survival', act: 'survival', title: 'Try Survival', why: 'Everything for today is done. ' + (S.best.survival ? 'Your best is ' + S.best.survival.pts + ' pts.' : 'Three lives, and the difficulty climbs with every answer.'), cta: 'Play Survival' };
}

/** Slip kinds: [label, what to do about it]. */
export const ERRL = {
  swap: ['Swapped digits', 'You had the right digits in the wrong order. Say the answer once in your head before typing.'],
  off1: ['Off by one', 'Usually a dropped carry or borrow in the last step. Re-check it before you type.'],
  place: ['Carry or place slip', 'Off by a 10, 100 or 1000: line the place values up before adding or subtracting.'],
  digit: ['One wrong digit', 'Right method, one digit off. Slow down on the final step.'],
  other: ['Different answer', 'Press H on a miss to compare your route with the worked method.'],
  skip: ['Skipped', 'Any estimate beats a skip: a rough guess shows what is off.'],
};

/** Table facts worth practising: seen at least twice and either missed often or slow. Worst first, max 12. Each is [a, b] with a <= b. */
export function weakFacts() {
  return Object.entries(S.facts || {})
    .filter(([, o]) => o && o.n >= 2 && ['fb', 'fm'].includes(factClass(o)))
    .map(([k, o]) => [k, (1 - o.ok / o.n) * 3 + Math.max(0, (o.ok ? o.r / o.ok : 2) - 1)])
    .sort((x, y) => y[1] - x[1]).slice(0, 12)
    .map(([k]) => k.split('×').map(Number));
}

/**
 * Retention across questions that have been mastered. `retained` counts questions that have
 * never been missed since they were mastered; `slipped` counts those that have come back.
 */
export function masteryStats() {
  const all = Object.values(S.mastered || {});
  const slipped = all.filter((m) => (m.lapses || 0) > 0).length;
  return {
    mastered: all.length,
    slipped,
    retained: all.length - slipped,
    lapses: all.reduce((n, m) => n + Math.max(0, m.lapses || 0), 0),
    rate: all.length ? (all.length - slipped) / all.length : 0,
  };
}

/** The smallest paired cohort worth showing as a percentage; below this the card collects instead. */
export const RETENTION_MIN = 5;

/**
 * Delayed recall: of the questions answered cleanly both when first seen and again at least seven
 * days later, how many were right at each point? Only questions with both observations count, so
 * `initialRate` and `retentionRate` describe exactly the same questions.
 */
export function retentionStats(skill = '') {
  const all = Object.values(S.recall || {}).filter((r) => r && r.t0 > 0);
  const rows = skill ? all.filter((r) => r.sk === skill) : all;
  const done = rows.filter((r) => r.t1 > 0 && r.t1 - r.t0 >= RECALL_GAP);
  const initial = done.reduce((n, r) => n + (r.ok0 ? 1 : 0), 0);
  const retained = done.reduce((n, r) => n + (r.ok1 ? 1 : 0), 0);
  return {
    cohort: done.length,
    pending: rows.length - done.length,
    initial,
    retained,
    initialRate: done.length ? initial / done.length : 0,
    retentionRate: done.length ? retained / done.length : 0,
    forgot: done.reduce((n, r) => n + (r.ok0 && !r.ok1 ? 1 : 0), 0),
    recovered: done.reduce((n, r) => n + (!r.ok0 && r.ok1 ? 1 : 0), 0),
  };
}

/** One trick for today, the same all day: from your weakest skills when it can be, otherwise any. */
export function trickOfDay(now = Date.now()) {
  const day = Math.floor(now / 864e5), wk = new Set(weakestSkills(3)), pool = TRICKS.filter((t) => wk.has(t.sk));
  const L = pool.length ? pool : TRICKS;
  return L[day % L.length];   // walks the whole pool, one trick per day
}

/** Times-table map colour class for one fact's stats {n, ok, r}: f0 new, fb missed, fm slow, fg good, fa fast and accurate. */
export function factClass(o) {
  if (!o || o.n < 1) return 'f0';
  const acc = o.ok / o.n, sp = o.ok ? o.r / o.ok : 2;
  return acc < 0.75 ? 'fb' : sp > 1.3 ? 'fm' : sp <= 0.85 && acc >= 0.95 ? 'fa' : 'fg';
}

/** Today's checklist for the Home card: practise to your goal, clear what is due, play the daily. Each item: { id, label, detail, done, act }. */
export function plan(now = Date.now()) {
  const today = ymd(now), goal = S.goal || 2;
  const td = todayCount(now);
  const due = Object.values(S.weak).filter((w) => w.due <= now).length;
  return [
    { id: 'train', label: 'Practise', detail: Math.min(td, goal) + '/' + goal, done: td >= goal, act: 'recommended' },
    { id: 'review', label: 'Review', detail: due ? Math.min(due, 20) + ' due' : 'all clear', done: due == 0, act: 'review' },
    { id: 'daily', label: 'Daily', detail: S.daily && S.daily[today] ? S.daily[today] + ' pts' : '60 s', done: !!(S.daily && S.daily[today]), act: 'daily' },
  ];
}

/** [current, target] toward a milestone, for the progress hints on locked ones. */
const PROG = { s3: ['ls', 3], s7: ['ls', 7], s14: ['ls', 14], s30: ['ls', 30], a1: ['n', 100], a2: ['n', 1e3], a3: ['n', 5e3], a4: ['n', 2e4], l6: ['mx', 6], l8: ['mx', 8], l10: ['mx', 10], m6: ['mn', 6], d1: ['dy', 1], d7: ['dy', 7], d30: ['dy', 30], sv20: ['sv', 20], sv50: ['sv', 50] };
export function msProgress(id, c = ctx()) {
  const p = PROG[id];
  if (!p) return null;
  const v = c[p[0]], rating = ['mx', 'mn'].includes(p[0]);
  const goal = rating ? p[1] * 100 : p[1];
  return { cur: Math.min(goal, rating ? Math.round(v * 100) : v), goal };
}
