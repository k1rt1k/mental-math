// A practice session: question selection, answer handling, adaptive ratings, spaced review, results.
// DOM-free so it can be tested in Node. The views in js/views/play.js drive it.
import { S, save, persist, cfgNow, master, recordLapse, recordRecall, bump, reviewPlan, forget } from './state.js';
import { IDS, CORE, MAXLV, SK, symFor, ansMatch, T, factOf, errKind, timeCap, worth, speedMult, gen, how, qk, perfScore, nextRating, weakness, INTERVALS, MASTER_BOX, genZeta, zNorm, zKey } from './engine.js';
import { clamp, ymd, seeded } from './util.js';
import { ctx, MS, weakFacts } from './stats.js';

export const mkOf = (c) =>
  c.only == 'zeta' ? 'zeta' + zKey(c.zeta) + c.dur :
  (c.only == 'all' ? (c.dur == 120 ? 'train' : 't' + c.dur) : c.only == 'mix' ? 'mix' + (c.mix || []).slice().sort().join('') + c.dur : c.only + c.dur) + (c.off ? 'o' + c.off : '') + (c.pats && c.pats.length ? '~' + c.pats.slice().sort().join('|') : c.patt ? '~' + c.patt : '') + (c.wf ? 'wf' : '');

/** Keypad neighbours, diagonals included. Both layouts count, so a numpad and a phone pad are each forgiven. */
const PADS = [[[1, 2, 3], [4, 5, 6], [7, 8, 9], [-1, 0, -1]], [[7, 8, 9], [4, 5, 6], [1, 2, 3], [-1, 0, -1]]];
export const adjacentDigits = (a, b) => a !== b && PADS.some((g) => {
  const at = (d) => { for (let r = 0; r < 4; r++) { const c = g[r].indexOf(+d); if (c >= 0) return [r, c]; } return null; };
  const p = at(a), q = at(b);
  return p && q && Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;
});
/** A full-length answer that is wrong only in its last digit, and that digit sits next to the right one on the keypad. */
export const nearMiss = (ans, buf) => ans.length == buf.length && ans.slice(0, -1) == buf.slice(0, -1) && /^\d$/.test(ans.slice(-1)) && adjacentDigits(ans.slice(-1), buf.slice(-1));
export const LIVES = 3;
/** Sprint: questions per race, and the seconds added for each slip / skip, so rushing never pays. */
export const SPRINT = 20, SLIP_S = 3, SKIP_S = 5;
/** Sprint score in seconds: clock time plus penalties. Lower is better. */
export const sprintScore = (el, slips, skips) => +(el + SLIP_S * slips + SKIP_S * skips).toFixed(1);
const MAX_WEAK = 80, MAX_HIST = 240;

/** Add a question to the notebook, evicting the most-mastered entry when it is full. */
function addWeak(e) {
  S.weak[e.q] = { q: e.q, a: e.a, sk: e.sk, d: e.d, pt: e.pt, tip: e.tip, ty: e.lastWrong || e.ty || '', box: 0, due: e.due ?? Date.now(), at: Date.now() };
  if (Object.keys(S.weak).length > MAX_WEAK) {
    const drop = Object.values(S.weak).filter((w) => w.q != e.q).sort((x, y) => y.box - x.box || (x.at || 0) - (y.at || 0))[0];
    if (drop) forget(drop.q);
  }
}

/** After 5+ idle days, ease ratings slightly (they recover fast). Returns a message or ''. */
export function applyRust() {
  const last = S.sessions.length && S.sessions[S.sessions.length - 1].t;
  if (!last || S.rustFor == last) return '';
  const g = Math.floor((Date.now() - last) / 864e5);
  if (g < 5) return '';                 // not idle long enough yet: leave the flag alone so a later visit can still ease ratings
  S.rustFor = last;
  const dd = Math.min(0.6, (g - 4) * 0.04);
  IDS.forEach((k) => (S.sk[k].lv = clamp(S.sk[k].lv - dd, 1, 12)));
  save();
  return 'Welcome back after ' + g + ' days. Ratings eased by up to ' + Math.round(dd * 100) + ' and recover fast.';
}

export class Session {
  /** opt: undefined (use saved config) | 'review' | 'daily' | 'survival' | 'sprint'. deps.cfg overrides the saved config for this run only (drills, recommendations). */
  constructor(opt, deps = {}) {
    this.now = deps.now || (() => performance.now());
    this.wall = deps.wall || Date.now;   // wall-clock time for saved history (tests can supply a fixed clock)
    this.rand = deps.rand || Math.random;
    const cf = deps.cfg ? Object.assign(cfgNow(), deps.cfg) : cfgNow(), rv = opt === 'review', dy = opt === 'daily', sv = opt === 'survival', sp = opt === 'sprint';
    const mx = (cf.mix || []).filter((k) => IDS.includes(k));
    const on = rv ? 'review' : dy ? 'daily' : sv || sp ? 'all' : cf.only == 'mix' ? (mx.length == 1 ? mx[0] : mx.length ? 'mix' : 'all') : cf.only;
    this.kind = rv ? 'review' : dy ? 'daily' : sv ? 'survival' : sp ? 'sprint' : on == 'zeta' ? 'zeta' : on == 'all' && !cf.off ? 'train' : 'focus';
    this.z = on == 'zeta' ? zNorm(cf.zeta) : null;
    this.day = ymd();                                          // the Daily belongs to the day it started, even if it ends after midnight
    this.mk = rv ? 'review' : dy ? 'daily' + this.day : sv ? 'survival' : sp ? 'sprint' : mkOf(cf);
    this.only = on;
    this.patt = rv || sv || sp || on == 'all' || on == 'mix' || on == 'daily' ? null : cf.patt || null;
    this.pats = this.patt || rv || sv || sp || on == 'all' || on == 'mix' || on == 'daily' || !Array.isArray(cf.pats) ? null : cf.pats.filter((p) => typeof p == 'string' && p).slice(0, 12);
    if (this.pats && !this.pats.length) this.pats = null;
    this.pool = mx;
    this.un = sp || (!rv && !dy && !sv && !cf.dur);               // untimed practice
    this.dur = rv ? 300 : dy ? 60 : this.un || sv ? 0 : cf.dur;
    this.off = rv || dy || sv || sp ? 0 : cf.off || 0;           // difficulty offset
    this.wfList = !rv && !dy && !sv && !sp && cf.wf ? weakFacts() : [];   // fixed at the start, so facts you fix mid-drill stay in the drill
    this.wf = this.wfList.length > 0;   // weak-fact drill: fixed-difficulty table facts
    this.frozen = dy || sv || sp || on == 'zeta' || !!this.off || this.wf;                  // ratings don't move
    this.lives = sv ? LIVES : 0;
    this.rng = dy ? seeded(+this.day.replace(/-/g, '')) : null;
    Object.assign(this, { errs: [], skips: 0, n: 0, ok: 0, pts: 0, tsum: 0, rs: 0, by: {}, g: [], retry: [], recent: [], last: [], miss: [], lu: [], tl: [], log: [], feed: [], done: {}, combo: 0, bc: 0, fast: 99, ft: 0, slips: 0, el: 0, buf: '', wrong: 0, cur: null, paused: 0, over: false });
    this.lv0 = IDS.map((k) => S.sk[k].lv);
    const b = S.best[this.mk] || {};
    this.ghost = b.g || null;
    this.gmax = b.pts || 0;
    this.target = sp ? SPRINT : 0;                         // sprint: a fixed number of questions, fastest total time wins
    const rp = rv ? reviewPlan() : null;
    this.rvSet = rp && rp.dueOnly ? new Set(rp.dueKeys) : null;   // review covers what was due when it started, then stops
    this.total = rv ? rp.count : sp ? SPRINT : 0;   // review length, for the "3 of 12" label
    this.t0 = this.qs = 0;
  }

  /* ---- clock ---- */
  begin() { this.t0 = this.now(); }
  tick() { if (!this.paused) this.el = (this.now() - this.t0) / 1000; return this.el; }
  left() { return this.un || this.kind == 'survival' ? Infinity : Math.max(0, this.dur - this.el); }
  qAge() { return (this.now() - this.qs) / 1000; }
  pause() { if (!this.paused) this.paused = this.now(); }
  resume() { if (!this.paused) return; const d = this.now() - this.paused; this.t0 += d; this.qs += d; this.paused = 0; }
  /** True once per question when it has sat unanswered past `limit` seconds, so the caller can auto-pause. Resuming keeps the question's age, so without the once-only flag it would re-pause on the very next tick. */
  idle(limit = 30) {
    if (!this.cur || this.un || this.paused || this.cur.idled || this.qAge() <= limit) return false;
    this.cur.idled = 1;
    return true;
  }
  get timedOut() { return !this.un && this.kind != 'survival' && this.el >= this.dur; }

  /* ---- question selection ---- */
  pickSkill() {
    if (this.only && this.only != 'all' && this.only != 'mix') return this.only;
    const w = IDS.map((k) => (this.only == 'mix' && !this.pool.includes(k) ? 0 : k == this.last[0] && k == this.last[1] ? 0 : 1 + 2 * weakness(S.sk[k])));
    let r = this.rand() * w.reduce((a, b) => a + b), i = 0;
    while (r > w[i] && i < IDS.length - 1) { r -= w[i]; i++; }
    return IDS[i];
  }

  variant(w) {
    let p = null;
    for (let i = 0; i < 30; i++) { const c = gen(w.sk, w.d, this.rand); if (c.pt == w.pt && qk(c.q) != qk(w.q)) { p = c; break; } }
    return p ? { ...p, rt: 1, wk: w.q } : { ...w, rt: 1 };
  }

  nextQ() {
    if (this.kind == 'daily') { const R = this.rng; return gen(CORE[Math.floor(R() * CORE.length)], 6, R); }   // the original ten: the Daily stays the same for everyone
    if (this.kind == 'review') return this.nextQ0();
    const hist = (S.hist = S.hist || []);
    let best = null, bi = 1e9;
    for (let i = 0; i < 30; i++) {
      const cds = this.retry.map((r) => r.cd), p = this.nextQ0();
      if (!p || p.rt || p.nr) return p;   // retries and weak facts are repeated on purpose, so no history de-duplication
      const ix = hist.lastIndexOf(qk(p.q));
      if (ix < 0) return p;
      if (ix < bi) { bi = ix; best = p; }
      this.retry.forEach((r, j) => (r.cd = cds[j]));
    }
    this.retry.forEach((r) => r.cd--);
    // All 30 tries repeated something asked in the last few questions. That happens where the pool is tiny (level 1 has 9 squares and 7 roots).
    // Stretch the level a touch for a fresh question rather than re-ask a recent one. Pattern drills stay on their pattern, so they are left alone.
    if (best && bi >= hist.length - 8 && !this.patt && !this.pats && !best.rt && !best.nr && best.sk && this.kind != 'zeta') {
      for (let j = 0; j < 24; j++) {
        const c = gen(best.sk, Math.min(MAXLV, (best.d || 1) + 0.5 + j * 0.06), this.rand);
        if (hist.lastIndexOf(qk(c.q)) < 0) { c.bonus = best.bonus || 0; return c; }
      }
    }
    return best;
  }

  nextQ0() {
    const R = this.rand;
    if (this.kind == 'review') {
      const left = Object.values(S.weak).filter((w) => !this.done[w.q] && (!this.rvSet || this.rvSet.has(w.q))), now = Date.now(), dueNow = left.filter((w) => w.due <= now), P = dueNow.length ? dueNow : left;   // due items first, then the rest
      const Q = P.filter((w) => !this.recent.includes(w.q)), pool = Q.length ? Q : P;
      if (!pool.length || Object.keys(this.done).length >= 20) return null;
      return this.variant(pool[Math.floor(R() * pool.length)]);
    }
    this.retry.forEach((r) => r.cd--);
    const it = this.retry.find((r) => r.cd <= 0);
    if (it) { this.retry.splice(this.retry.indexOf(it), 1); return { ...it.p, rt: 1, retry: 1 }; }
    if (this.kind == 'zeta') return { ...genZeta(this.z, R), bonus: 0 };
    if (this.wf && (this.kind == 'train' || this.kind == 'focus')) { const f = this.factQ(); if (f) return f; }
    if (this.kind != 'survival' && R() < 0.07) {
      const now = Date.now();
      const c = Object.values(S.weak).filter((w) => w.due <= now && w.box > 0 && now - (w.at || 0) > 6e5 && !this.recent.includes(w.q) && (this.only == 'all' || (this.only == 'mix' ? this.pool.includes(w.sk) : w.sk == this.only)));
      if (c.length) return this.variant(c[Math.floor(R() * c.length)]);
    }
    const k = this.pickSkill();
    this.last = [k, this.last[0]];
    let bonus = 0, d;
    if (this.kind == 'survival') d = S.sk[k].lv - 1 + Math.min(6, this.n * 0.12) + R() * 1.2;
    else {
      d = S.sk[k].lv + R() * 1.7 - 1 + this.off + Math.min(0.9, Math.max(0, (this.combo - 4) * 0.15)) - (this.combo == 0 && this.n > 5 ? 0.3 : 0);
      if (this.n < 5) d -= 1; else if (R() < 0.07) { bonus = 1; d += 1.5; }   // 5-question warm-up, then rare bonus questions
    }
    const wt = (c) => { const o = S.pat[SK[c.sk].n + ' · ' + c.pt]; return o && o.n >= 6 ? (1 - o.ok / o.n) * 3 + Math.max(0, (o.ok ? o.r / o.ok : 2) - 1) : 0.3; };
    let p = gen(k, d, R);
    if (!this.patt && !this.pats && this.kind != 'survival' && (k == 'mul' || k == 'div') && R() < 0.12) p = this.factQ() || p;   // a weak table fact now and then
    const target = this.patt || (this.pats ? this.pats[this.n % this.pats.length] : '');   // shortcut stages rotate through every trick pattern
    if (target) for (let i = 0; i < 60 && p.pt != target; i++) p = gen(k, i > 25 ? Math.max(d, 8) : d, R, target);   // some tricks only appear at high difficulty (Real-life drills get their kinds directly)
    else for (let i = 0; i < 3; i++) { const c = gen(k, d, R); if (wt(c) > wt(p) && R() < 0.7) p = c; }   // lean toward patterns you struggle with
    p.bonus = bonus;
    return p;
  }

  /** A question from one of your weak table facts (× or ÷ form), or null when there are none. */
  factQ() {
    const W = this.wf ? this.wfList : weakFacts(), R = this.rand;
    if (!W.length) return null;
    let a, b, div, q;
    for (let i = 0; i < 12; i++) {   // never the same question as one of the last few
      [a, b] = W[Math.floor(R() * W.length)];
      if (R() < 0.5) [a, b] = [b, a];
      div = R() < 0.4; q = div ? a * b + ' ÷ ' + a : a + ' × ' + b;
      if (!this.recent.includes(q)) break;
    }
    const p = { q, a: div ? b : a * b, sk: div ? 'div' : 'mul', d: 3, pt: 'weak fact', nr: 1, tip: 'Say the table fact out loud: ' + Math.min(a, b) + ' × ' + Math.max(a, b) + ' = ' + a * b, bonus: 0 };
    return p;
  }

  /** Write ratings / notebook / pattern stats to storage mid-session so a killed tab loses nothing. No sync, no session record. */
  checkpoint() { persist(); }

  /** Move to the next question. Returns false when the session has nothing more to ask (review done). */
  next() {
    const nq = this.nextQ();
    if (!nq) return false;
    this.cur = nq; this.qs = this.now(); this.buf = ''; this.wrong = 0; this.grace = 0;
    return true;
  }

  /* ---- input ---- */
  /** Type one digit. Returns 'more' | 'ok' | 'bad' | 'near'. 'near' is a grace period, not a slip yet: see `commit`. */
  type(dg) {
    if (![...String(dg)].every((c) => /\d/.test(c) || c === symFor(this.cur.sk))) return 'more';   // a symbol key only works on questions that use it
    if (this.wrong) { this.wrong = 0; this.buf = ''; }
    if (this.grace) { this.grace = 0; this.buf = this.buf.slice(0, -1); }   // typing during the grace window replaces the last digit
    const ans = String(this.cur.a);
    if (S.ent) {                                    // Enter-to-submit: never judge, or reveal the length, while typing
      if (this.buf.length < Math.max(ans.length + 2, 6)) this.buf += dg;
      return 'more';
    }
    this.buf += dg;
    if (ansMatch(this.buf, ans)) return 'ok';
    if (this.buf.length >= ans.length) {
      if (!S.noGrace && !this.cur.graced && nearMiss(ans, this.buf)) { this.grace = 1; this.cur.graced = 1; return 'near'; }
      return this.slip();
    }
    return 'more';
  }
  /** Enter-to-submit: judge what is typed. Returns 'ok' | 'bad' | 'none' (nothing typed). */
  submit() {
    if (!this.buf || this.wrong) return 'none';
    this.grace = 0;
    return ansMatch(this.buf, this.cur.a) ? 'ok' : this.slip();
  }
  /** The grace window ran out without a fix: the near-miss now counts as the slip it was. */
  commit() { if (!this.grace) return 'more'; this.grace = 0; return this.slip(); }
  slip() {
    const ans = String(this.cur.a);
    this.slips++; this.cur.tries = (this.cur.tries || 0) + 1; this.combo = 0; this.wrong = 1;
    const ek = errKind(ans, this.buf); this.cur.lastWrong = this.buf; this.errs.push(ek); bump('errs', ek);
    if (this.lives) { this.lives--; if (this.lives <= 0) this.over = true; }
    return 'bad';
  }
  back() { this.grace = 0; if (this.wrong) { this.wrong = 0; this.buf = ''; } else this.buf = this.buf.slice(0, -1); }
  hint() { this.cur.hinted = 1; return { tip: this.cur.tip, how: how(this.cur) }; }

  /** Record an answer (ok=false means skipped). Returns details for the UI. */
  answer(ok) {
    const p = this.cur, Tt = T(p.sk, p.d, p.a), tm = Math.min(this.qAge(), timeCap(Tt)), r = tm / Tt, s = S.sk[p.sk];   // r = time ÷ par: 1 means exactly on pace
    const sc = perfScore(ok, r, p.tries || 0);
    let lvl = '', mastered = false, lapse = false;
    if (!p.rt && !p.nr && !this.frozen && !p.hinted) {   // nr: easy table facts mixed in for practice never move a rating
      const peak = Math.floor(Math.max(s.pk || 0, s.lv));   // a level-up is a NEW peak: wobbling back across a boundary you already reached is not one
      s.lv = nextRating(s, sc, p.bonus);
      s.pk = Math.max(s.pk || 0, s.lv);
      s.acc = s.acc * 0.95 + 0.05 * (ok ? (p.tries ? 0.5 : 1) : 0);   // a slip that was then fixed counts half, so accuracy is not flattered
      if (ok) s.spd = s.spd * 0.9 + 0.1 * r;
      s.n++;
      if (Math.floor(s.lv) > peak) { lvl = SK[p.sk].n + ' → ' + Math.floor(s.lv) * 100; this.lu.push(lvl); }
    }
    const b = (this.by[p.sk] = this.by[p.sk] || [0, 0, 0]);
    b[0]++; this.n++;
    if (ok) {
      b[1]++; b[2] += tm; this.ok++; this.rs += r;
      if (!p.tries && !p.hinted) this.ft++;   // a hint is not a first-try answer; first-try stats and path goals must stay honest
      this.tsum += tm;
      this.pts += Math.round(worth(p.sk, p.d) * speedMult(r) * (p.hinted ? 0.5 : 1) * (p.tries ? 0.7 : 1)) * (p.bonus ? 2 : 1);
      this.g.push([+this.el.toFixed(1), this.pts]);
      this.fast = Math.min(this.fast, tm);
    }
    if (!ok && !p.tries) { this.skips++; bump('errs', 'skip'); }
    this.combo = ok ? this.combo + 1 : 0;
    this.bc = Math.max(this.bc, this.combo);
    if (!ok && this.lives && !p.tries) { this.lives--; if (this.lives <= 0) this.over = true; }   // a skip costs a life (a slip already did)
    if (ok && !p.rt) this.tl.push([p.q, tm, how(p)]);
    if (!p.rt && !p.nr && p.pt && this.kind != 'zeta') { bump('pat', SK[p.sk].n + ' · ' + p.pt, 1, ok ? 1 : 0, ok ? r : 0); }
    const fk = !p.rt && !p.hinted && (p.sk == 'mul' || p.sk == 'div') ? factOf(p.q) : '';
    if (fk) bump('facts', fk, 1, ok ? 1 : 0, ok ? r : 0);
    const key = p.wk || p.q, w = S.weak[key], now = this.wall();
    if (ok && this.kind == 'review') this.done[key] = 1;
    // A correct answer only moves a notebook entry forward if it was fast, first try, unhinted and not a
    // same-session retry. Review questions (`rt`) still count: the spaced retrieval is the point.
    if (ok && w) {
      if (r <= 1.15 && !p.tries && !p.retry && !p.hinted) {
        w.box = Math.min(MASTER_BOX, Math.max(0, w.box || 0) + 1);
        w.seen = now;
        if (w.box >= MASTER_BOX) { master(key, w, now); mastered = true; }   // retention confirmed: leave active review
        else w.due = now + INTERVALS[w.box];
      } else w.due = now + INTERVALS[1];   // slow, hinted or slipped: keep the stage, check again in 10 minutes
    }
    // slipped first, then got it right: still worth another look later (no retry this session, you just solved it)
    else if (ok && p.tries && !p.rt && !w && this.kind != 'zeta') addWeak({ ...p, due: now + INTERVALS[1] });
    if (!ok) {
      // A mastered question coming back is the meaningful signal: record the lapse, then re-open it at stage 0.
      if (!S.weak[key] && recordLapse(p.wk && !S.weak[p.wk] ? p.wk : p.q, now)) lapse = true;
      if (p.wk && S.weak[p.wk]) Object.assign(S.weak[p.wk], { box: 0, due: now, at: now });
      else addWeak(p);
      this.retry.push({ p: { q: p.q, a: p.a, sk: p.sk, d: p.d, pt: p.pt, tip: p.tip }, cd: 4 });
      if (this.miss.length < 8) this.miss.push({ q: p.q, a: p.a, sk: p.sk, d: p.d, pt: p.pt, ty: p.lastWrong || '', how: how(p) });
    }
    // Delayed-recall analytics: only a clean first attempt is a fair memory test. Review prompts count
    // (`rt`), because spaced retrieval is the point; a same-session retry (`retry`), a slip (`tries`)
    // or a hinted answer does not.
    if (!p.retry && !p.tries && !p.hinted) recordRecall(p.q, ok, now, true, p.sk);
    this.feed.unshift([p.q, ok, tm, r]); this.feed.length = Math.min(this.feed.length, 8);
    this.log.push({ q: p.q, a: p.a, ok, tm: +tm.toFixed(2), sk: p.sk, pt: p.pt, rt: !!p.rt, hinted: !!p.hinted, tries: p.tries || 0, ty: p.lastWrong || '' });
    S.hist.push(qk(p.q)); if (S.hist.length > MAX_HIST) S.hist.shift();
    this.recent.push(p.q); if (this.recent.length > 6) this.recent.shift();
    const res = { ok, tm, r, lvl, p, rough: false, mastered, lapse };
    if (this.feed.length >= 8 && this.n % 8 == 0 && this.feed.filter((f) => f[1]).length <= 3) res.rough = true;
    return res;
  }

  /**
   * Close the session and persist it. Returns null if too short to count, else
   * { rec, tag, newBest, unlocked, dl } for the results screen.
   */
  finish() {
    const e = this, rv = e.kind == 'review', sv = e.kind == 'survival', sp = e.kind == 'sprint';
    const full = sp ? e.n >= e.target : sv || (!e.un && e.el >= e.dur - 0.5);
    if (e.n < (full || rv ? 1 : 5) || !e.ok) return null;   // too short, or nothing right: not a session (a run of skips must not extend a streak)
    const rec = { t: Date.now(), m: e.kind, dur: full && !sv && !sp ? e.dur : Math.max(1, Math.round(e.el)), n: e.n, ok: e.ok, ft: e.ft, pts: e.pts, tm: e.ok ? +(e.tsum / e.ok).toFixed(2) : 0, by: e.by, lv: {}, off: 0 };
    IDS.forEach((k) => (rec.lv[k] = +S.sk[k].lv.toFixed(2)));
    S.sessions.push(rec);
    const spScore = sp ? sprintScore(e.el, e.slips, e.skips) : 0;
    if (sp) rec.sc = spScore;
    if (e.kind == 'daily') S.daily[e.day] = Math.max(S.daily[e.day] || 0, e.pts);
    const prev = S.best[e.mk];
    let bestBy = 0;
    let tag = prev ? (e.pts > prev.pts ? 'New personal best' : 'Your best here is ' + prev.pts + ' pts') : 'First run saved as your ghost', newBest = false;
    if (sp) {
      const pb = S.best.sprint;
      if (!full) tag = 'Ended early, not counted for your best time';
      else if (!pb || spScore < pb.t) { S.best.sprint = { t: spScore, pts: e.pts, n: e.ok }; newBest = !!pb; bestBy = pb ? +(pb.t - spScore).toFixed(1) : 0; tag = pb ? 'New best time' : 'First Sprint saved: your time to beat'; }
      else tag = 'Your best time is ' + pb.t + ' s';
    } else if (rv) tag = 'Review complete';
    else if (e.un) tag = 'Practice session, not counted for bests';
    else if (!full) tag = 'Ended early, not counted for bests';
    else if (!sp && (!prev || e.pts > prev.pts)) { S.best[e.mk] = { pts: e.pts, n: e.ok, g: e.g }; newBest = !!prev; bestBy = prev ? e.pts - prev.pts : 0; }
    // keep only the last 7 daily ghosts
    Object.keys(S.best).filter((k) => /^daily\d/.test(k)).sort().slice(0, -7).forEach((k) => delete S.best[k]);
    const c = ctx(), unlocked = MS.filter((m) => m[2](c) && !S.ms.includes(m[0]));
    unlocked.forEach((m) => S.ms.push(m[0]));
    save();
    const dl = IDS.map((k, i) => [k, Math.round((S.sk[k].lv - e.lv0[i]) * 100)]).filter((x) => Math.abs(x[1]) >= 3);
    return { rec, tag, newBest, unlocked, dl, full, sprint: spScore, bestBy };
  }
}
