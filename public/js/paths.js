// Guided learning paths: progress, gating, assessment rules and the stage question generator. DOM-free (see views/paths.js for the screens).
import { S, PATH_RET } from './state.js';
import { IDS, SK, gen, qk, T, ansMatch, symFor } from './engine.js';
import { Session } from './session.js';
import { PATHS, KINDS, PATH_STAGES } from './pathsData.js';
import { MS, ctx as statsCtx } from './stats.js';

export { PATHS, KINDS, PATH_STAGES };
export const PHASES = ['Teach', 'Demonstrate', 'Practise', 'Check'];
const DAY = 864e5;
/** Delayed retention checks: the first is due a day after the mastery test is passed, the second a week after the first. */
export const RET = [{ label: 'Next-day check', gap: DAY }, { label: 'One-week check', gap: 7 * DAY }];
/** A failed retention check can be retaken a day later, after a refresher. */
export const RETRY_GAP = DAY;

/** The placement quiz: up to PLACE.per questions at each of stages 1 to 4, no hints, every one right first try to clear a stage. The mastery test and the retention checks are never skipped. */
export const PLACE = { per: 3, last: PATH_STAGES - 2 };

/** How each kind of run is judged. n questions; need = correct first-try answers; pace = mean time ÷ par over correct answers (null = not judged). */
export const RULES = {
  practise: (st) => ({ n: 8, need: 0, pace: null, hints: true, guided: 2 }),
  check: (st) => ({ n: 5, need: 4, pace: null, hints: false }),
  test: (st) => ({ n: 12, need: 10, pace: 1.25, hints: false }),
  retain: (st) => ({ n: 6, need: 5, pace: 1.4, hints: false }),
  place: (st) => ({ n: PLACE.per * (PLACE.last + 1), need: PLACE.per, pace: null, hints: false }),
};
/** Which run the stage's final Check phase is: the last stage is the timed mastery test. */
export const checkMode = (si) => (si == PATH_STAGES - 1 ? 'test' : 'check');

export const stagesOf = (k) => PATHS[k].stages;
export const hasPath = (k) => !!PATHS[k];

/** The (read-only) saved record for a skill, with empty defaults. */
export function rec(k) {
  const e = S.paths && S.paths[k];
  return e || { st: Array.from({ length: PATH_STAGES }, () => ({ ph: 0, pass: 0, sc: 0, at: 0 })), ret: Array.from({ length: PATH_RET }, () => ({ t: 0, ok: 0 })) };
}
/** The writable record, created on first use. */
export function ensure(k) {
  S.paths = S.paths || {};
  if (!S.paths[k]) S.paths[k] = JSON.parse(JSON.stringify(rec(k)));
  return S.paths[k];
}

/** Status of one retention check. state: locked | waiting | due | done | retry. */
export function retState(k, i, now = Date.now()) {
  const r = rec(k), last = r.st[PATH_STAGES - 1];
  if (!last.pass) return { state: 'locked', dueAt: 0 };
  const prev = i == 0 ? last.pass : r.ret[i - 1].ok ? r.ret[i - 1].t : 0;
  if (!prev) return { state: 'locked', dueAt: 0 };
  const me = r.ret[i];
  if (me.ok) return { state: 'done', dueAt: 0, t: me.t };
  const dueAt = me.t ? me.t + RETRY_GAP : prev + RET[i].gap;
  return { state: now >= dueAt ? (me.t ? 'retry' : 'due') : 'waiting', dueAt };
}

/** Everything the screens need about one skill's path. */
export function progress(k, now = Date.now()) {
  const r = rec(k);
  const stages = r.st.map((s, i) => {
    const open = i == 0 || r.st[i - 1].pass > 0;
    return { i, open, done: s.pass > 0, ph: s.ph, sc: s.sc, state: s.pass ? 'done' : !open ? 'locked' : s.ph || s.at ? 'current' : 'open' };
  });
  const ret = RET.map((x, i) => ({ i, label: x.label, ...retState(k, i, now) }));
  const cur = stages.find((s) => !s.done);
  const done = stages.filter((s) => s.done).length + ret.filter((x) => x.state == 'done').length;
  const total = PATH_STAGES + RET.length;
  const dueRet = ret.find((x) => x.state == 'due' || x.state == 'retry');
  return { stages, ret, cur: cur ? cur.i : -1, done, total, pct: done / total, assessed: stages.every((s) => s.done), mastered: ret.every((x) => x.state == 'done'), dueRet: dueRet ? dueRet.i : -1, started: stages.some((s) => s.ph || s.pass || s.at) };
}

/** Mark that a lesson phase (0 teach, 1 demonstrate, 2 practise) was finished. Never moves backwards. */
export function donePhase(k, si, ph, now = Date.now()) {
  const s = ensure(k).st[si];
  s.ph = Math.max(s.ph, Math.min(3, ph + 1)); s.at = s.at || now;
}
/** Record a stage check or retention result. Returns the judged result. */
export function recordCheck(k, si, mode, result, now = Date.now()) {
  const e = ensure(k);
  if (mode == 'retain') {
    const i = result.ret, slot = e.ret[i];
    slot.t = now; slot.ok = result.pass ? 1 : 0;
    return result;
  }
  const s = e.st[si];
  s.at = s.at || now; s.sc = Math.max(s.sc, result.n ? result.correct / result.n : 0);
  if (result.pass) { s.pass = s.pass || now; s.ph = 3; }
  return result;
}

/**
 * Judge a finished run. rows: [{ ok, first, hinted, r }] (r = time ÷ par). A "correct" answer is right on the first try without a hint.
 */
export function judge(mode, rows, st) {
  const R = RULES[mode](st), n = Math.max(R.n, rows.length);
  const good = rows.filter((x) => x.ok && x.first && !x.hinted);
  const pace = good.length ? good.reduce((a, x) => a + x.r, 0) / good.length : 0;
  const enough = good.length >= R.need, quick = R.pace == null || (good.length > 0 && pace <= R.pace);
  const pass = R.need == 0 ? true : enough && quick;
  return { mode, pass, correct: good.length, n, need: R.need, pace: +pace.toFixed(2), paceLimit: R.pace, reason: pass ? '' : !enough ? 'accuracy' : 'pace' };
}

/** Which skill's path to suggest on Home / Learn: a due retention check, then the path in progress, then one for the weakest skill. */
export function nextUp(weakest) {
  let best = null;
  for (const k of IDS) {
    const p = progress(k);
    if (p.dueRet >= 0) return { k, kind: 'retain', ret: p.dueRet, p };
    if (p.started && !p.assessed && !best) best = { k, kind: 'continue', p };
  }
  if (best) return best;
  const k = weakest && PATHS[weakest] ? weakest : 'mul';
  const p = progress(k);
  return p.assessed ? null : { k, kind: p.started ? 'continue' : 'start', p };
}

/** One generated question for a stage. Round-robins the stage's patterns, widening the difficulty if a pattern only exists higher up. */
export function stageQuestion(k, st, n, R = Math.random, seen = new Set(), wide = 1) {
  const pats = st.p;
  for (let i = 0; i < 70; i++) {
    const want = pats ? pats[(n + (i > 25 ? i : 0)) % pats.length] : null;
    const base = st.d + (R() - 0.5) * wide;
    const d = i < 25 ? base : i < 50 ? Math.max(base, 8) : 11;
    const c = gen(k, d, R);
    if (pats && (i < 25 ? c.pt != want : !pats.includes(c.pt))) continue;
    if (seen.has(qk(c.q))) continue;
    return c;
  }
  return gen(k, st.d, R);
}

/**
 * A stage run driven by the same Session class as ordinary practice, so every answer feeds the notebook, pattern stats and
 * delayed-recall ledger. Ratings never move (frozen) and nothing is saved as a session.
 */
export class PathSession extends Session {
  constructor(skill, si, mode, deps = {}) {
    super(undefined, { ...deps, cfg: { only: skill, dur: 0, off: 0, patt: undefined, pats: undefined, wf: false, mix: [] } });
    this.skill = skill; this.si = si; this.pmode = mode;
    this.stg = stagesOf(skill)[si];
    this.rule = RULES[mode](this.stg);
    this.frozen = true; this.un = true; this.asked = new Set(); this.rows = [];
    this.cap = this.rule.n;
  }
  nextQ() {
    const wide = this.stg.p ? 1 : this.pmode == 'practise' || this.pmode == 'check' ? 2 : 1;
    const p = stageQuestion(this.skill, this.stg, this.n, this.rand, this.asked, wide);
    this.asked.add(qk(p.q));
    p.bonus = 0;
    return p;
  }
  /** Type one character (digit, or this skill's symbol such as - / .) and judge at once: no near-miss grace, no Enter-to-submit. Returns 'more' | 'ok' | 'bad'. */
  judgeBuf(ch) {
    const sym = symFor(this.cur.sk);
    if (!(/\d/.test(ch) || ch === sym || (ch === '-' && String(this.cur.a).startsWith('-')))) return 'more';
    if (this.wrong) { this.wrong = 0; this.buf = ''; }
    this.buf += ch;
    const ans = String(this.cur.a);
    if (ansMatch(this.buf, ans)) return 'ok';
    return this.buf.length >= ans.length ? this.slip() : 'more';
  }
  get finished() { return this.n >= this.cap; }
  /** Answer the current question and remember what the verdict needs. */
  record(ok) {
    const p = this.cur, par = T(p.sk, p.d, p.a), first = !p.tries, res = this.answer(ok);
    this.rows.push({ q: p.q, a: p.a, ok, first, hinted: !!p.hinted, r: res.r, tm: res.tm, par });
    return res;
  }
  verdict() { return judge(this.pmode, this.rows, this.stg); }
}

/** Can the placement quiz help here? Only while a stage before the mastery test is still to pass. */
export const canPlace = (k) => { const c = progress(k).cur; return c >= 0 && c <= PLACE.last; };

/**
 * The placement quiz: one run, one session. It starts at the first stage not yet passed and climbs, three questions per stage. One miss ends it
 * and the learner starts at that stage; clearing stage 4 opens the mastery test. `probe` is the first stage not cleared.
 */
export class PlaceSession extends PathSession {
  constructor(skill, from, deps = {}) {
    super(skill, from, 'place', deps);
    this.from = from; this.probe = from; this.pn = 0; this.over = false;
    this.cap = (PLACE.last - from + 1) * PLACE.per;
  }
  get finished() { return this.over; }
  record(ok) {
    const res = super.record(ok), row = this.rows[this.rows.length - 1];
    if (!(row.ok && row.first && !row.hinted)) { this.over = true; return res; }
    if (++this.pn >= PLACE.per) {
      this.pn = 0; this.probe++; this.si = this.probe;
      if (this.probe > PLACE.last) this.over = true; else this.stg = stagesOf(this.skill)[this.probe];
    }
    return res;
  }
}
/** Mark the stages a placement cleared (from up to, not including, upTo) as passed, so the path opens at the right stage. Never touches a score and never passes the mastery test. */
export function applyPlacement(k, from, upTo, now = Date.now()) {
  const e = ensure(k); let n = 0;
  for (let i = Math.max(0, from); i < Math.min(upTo, PATH_STAGES - 1); i++) { const s = e.st[i]; if (!s.pass) n++; s.pass = s.pass || now; s.ph = 3; s.at = s.at || now; }
  return n;
}

/**
 * Save a finished (or abandoned) path run as a lightweight session, like Flash does: it keeps the streak going and its minutes
 * add up toward the daily goal (see learnToday in stats.js). Ratings are untouched (the run is frozen) and `by` stays empty, so
 * pace charts and per-skill breakdowns never see it. Returns { rec, unlocked } or null when the run is too small to count.
 * An abandoned run needs 5+ answers, the same floor as ordinary sessions; a finished one only needs something right.
 */
export function logPathRun(sess, done = true, wall = Date.now) {
  if (!sess.ok || (!done && sess.n < 5)) return null;
  sess.tick();
  const dur = Math.max(1, Math.min(Math.round(sess.el), 90 * sess.n));   // a forgotten open tab must not buy goal minutes
  const last = S.sessions.length ? S.sessions[S.sessions.length - 1].t : 0;
  const lv = {}; IDS.forEach((k) => (lv[k] = +S.sk[k].lv.toFixed(2)));
  const rec = { t: Math.max(wall(), last + 1), m: 'path', dur, n: sess.n, ok: sess.ok, ft: sess.ft, pts: sess.pts, tm: +(sess.tsum / sess.ok).toFixed(2), by: {}, lv, off: 0, ps: sess.skill };
  S.sessions.push(rec);
  const c = statsCtx(), unlocked = MS.filter((m) => m[2](c) && !S.ms.includes(m[0]));
  unlocked.forEach((m) => S.ms.push(m[0]));
  return { rec, unlocked };
}

/** Retention checks that can be taken right now, across every skill. [{ k, i, label, state }] */
export function dueChecks(now = Date.now()) {
  const out = [];
  for (const k of IDS) { const p = progress(k, now); p.ret.forEach((r) => { if (r.state == 'due' || r.state == 'retry') out.push({ k, i: r.i, label: r.label, state: r.state }); }); }
  return out;
}
/** Every check still to come (waiting or ready), with the time it opens. Sent to the reminder server, which decides what is due at send time. */
export function pendingChecks(now = Date.now()) {
  const out = [];
  for (const k of IDS) { const p = progress(k, now); p.ret.forEach((r) => { if (r.dueAt && r.state != 'done' && r.state != 'locked') out.push({ at: r.dueAt, n: SK[k].n, l: r.label }); }); }
  return out.sort((a, b) => a.at - b.at).slice(0, 26);
}
/** When the next waiting check opens (ms), or 0. Lets the nav badge refresh itself at that moment. */
export const nextCheckAt = (now = Date.now()) => { const t = pendingChecks(now).map((x) => x.at).filter((t) => t > now); return t.length ? t[0] : 0; };

/** The story of a mastered path, for the celebration and the share card. */
export function masteryInfo(k) {
  const r = rec(k), p = progress(k), starts = r.st.map((s) => s.at).filter(Boolean), end = r.ret[PATH_RET - 1].t || Date.now();
  return { mastered: p.mastered, test: Math.round(100 * r.st[PATH_STAGES - 1].sc), days: starts.length ? Math.max(1, Math.round((end - Math.min(...starts)) / DAY) + 1) : 1, at: end, count: IDS.filter((x) => progress(x).mastered).length };
}
