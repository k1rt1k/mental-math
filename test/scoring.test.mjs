// Scoring, rating and timing: regression tests for the pre-5.4 bug where correct, accurate answers at a normal pace
// were scored "too slow" (target ≈ 1.1 s for a level-1 multiplication) and ratings collapsed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, SK, T, PAR, digitsOf, worth, speedMult, perfScore, nextRating, zetaEstimate, MAXLV } from '../public/js/engine.js';
import { S, replaceState, fresh, migrate, mergeStates, lowered, restoreRatings, finishCal, CAL } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { seeded } from '../public/js/util.js';

const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const solve = (s) => { for (const d of String(s.cur.a)) if (s.type(d) == 'ok') return s.answer(true); };

/* ---------------- par time ---------------- */
test('par time is realistic: never in "milliseconds", includes reading + typing, grows with difficulty and answer length', () => {
  for (const k of IDS) {
    assert.ok(T(k, 1, 12) >= 2, `${k}: level-1 par ${T(k, 1, 12)} s is too tight for a human to read and type`);
    assert.ok(T(k, 12) > T(k, 1) * 2, `${k}: par should grow clearly with difficulty`);
    for (let d = 1; d < 12; d += 0.5) assert.ok(T(k, d + 0.5, 50) > T(k, d, 50), `${k}: par must rise with d`);
    assert.ok(T(k, 5, 12345) > T(k, 5, 7), `${k}: a 5-digit answer takes longer to type than a 1-digit one`);
  }
  assert.equal(digitsOf(7), 1); assert.equal(digitsOf(100), 3); assert.equal(digitsOf(0), 1);
});

test('the old target would have been marked "too slow" for a 2.3 s, 100%-accurate round; the new par is not', () => {
  const oldT = (k, d) => SK[k].m * (0.8 + 0.3 * d + 0.025 * d * d);   // what 5.3 shipped
  const r_old = 2.3 / oldT('mul', 1.3), r_new = 2.3 / T('mul', 1.3, 48);
  assert.ok(r_old > 1.8, 'sanity: old ratio shows the bug');
  assert.ok(r_new < 1.1, `new ratio ${r_new.toFixed(2)} should be about par`);
});

/* ---------------- perfScore / nextRating ---------------- */
test('perfScore: par pace is the rating-neutral .72, continuous, monotonic, bounded', () => {
  assert.equal(perfScore(false, 0.1), 0);
  assert.equal(perfScore(true, 0.3), 1);
  assert.ok(Math.abs(perfScore(true, 1) - 0.72) < 1e-9, 'par scores exactly .72');
  let prev = 2;
  for (let r = 0; r <= 6; r += 0.01) {
    const v = perfScore(true, r);
    assert.ok(v <= prev + 1e-12, `monotonic at r=${r}`);
    if (r > 0) assert.ok(prev - v < 0.01, `no jumps at r=${r.toFixed(2)}`);
    assert.ok(v >= 0.3 - 1e-9 && v <= 1, 'a correct answer scores within [.3, 1]');
    prev = v;
  }
  assert.ok(perfScore(true, 1, 1) < perfScore(true, 1, 0) && perfScore(true, 1, 9) >= 0.4 * 0.3 - 1e-9, 'retries cost, down to a floor');
});

test('nextRating: par holds steady, gains/losses have the right sign, a loss is capped, bonus only amplifies gains', () => {
  for (const n of [0, 50, 500]) {
    const s = { lv: 5, n };
    assert.ok(Math.abs(nextRating(s, 0.72) - 5) < 1e-9, 'par pace leaves the rating alone');
    assert.ok(nextRating(s, 1) > 5 && nextRating(s, 0.4) < 5);
    assert.ok(5 - nextRating(s, 0) <= 0.25 + 1e-9, 'a skip/wrong answer costs at most .25');
    assert.ok(Math.abs(nextRating(s, 1, 1) - 5 - 1.3 * (nextRating(s, 1) - 5)) < 1e-9, 'bonus multiplies gains');
    assert.equal(nextRating(s, 0.3, 1), nextRating(s, 0.3), 'bonus does not multiply losses');
  }
  assert.ok(nextRating({ lv: 5, n: 0 }, 1) - 5 > nextRating({ lv: 5, n: 500 }, 1) - 5, 'new skills learn faster than settled ones');
  assert.equal(nextRating({ lv: MAXLV, n: 1 }, 1), MAXLV); assert.equal(nextRating({ lv: 1, n: 1 }, 0), 1);
});

test('points: speed bonus never penalises, is capped at +25%', () => {
  assert.equal(speedMult(5), 1); assert.equal(speedMult(1), 1); assert.equal(speedMult(0.6), 1.25); assert.equal(speedMult(0.1), 1.25);
  assert.ok(speedMult(0.8) > 1 && speedMult(0.8) < 1.25);
  for (const k of IDS) assert.ok(worth(k, 12) > worth(k, 1) && worth(k, 1) > 0);
});

/* ---------------- the regression from the bug report ---------------- */
function answerAt(s, c, paceOfPar, hist) {            // answer the current question taking `paceOfPar` × its par time
  const p = s.cur, sec = T(p.sk, p.d, p.a) * paceOfPar;
  c.adv(sec * 1000); s.tick(); const r = solve(s); s.next(); return r;
}

test('REGRESSION: 12 correct answers in a 30 s round at ~2.3 s each no longer lower ratings', () => {
  let total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    replaceState(fresh());
    IDS.forEach((k) => Object.assign(S.sk[k], { lv: 1.45, n: 60, spd: 1 })); S.cfg = { dur: 30, only: 'all' };
    const R = seeded(seed), c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(seed + 9) }); s.begin(); s.next();
    const before = IDS.map((k) => S.sk[k].lv);
    for (let i = 0; i < 12; i++) { c.adv((1.4 + R() * 1.9) * 1000); s.tick(); solve(s); s.next(); }
    total += IDS.reduce((a, k, i) => a + (S.sk[k].lv - before[i]) * 100, 0);
    assert.equal(s.ok, 12);
  }
  assert.ok(total / 20 > -5, `average total rating change ${(total / 20).toFixed(1)} must not be negative`);
});

test('answering at par holds a rating steady at low, middle and high levels', () => {
  for (const start of [1.5, 5, 9]) {
    replaceState(fresh()); IDS.forEach((k) => Object.assign(S.sk[k], { lv: start, n: 200 })); S.cfg = { dur: 0, only: 'all' };
    const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) }); s.begin(); s.next();
    for (let i = 0; i < 300; i++) answerAt(s, c, 1.0);
    const avg = IDS.reduce((a, k) => a + S.sk[k].lv, 0) / IDS.length;
    assert.ok(Math.abs(avg - start) < 0.5, `start ${start}: at par, average rating ended ${avg.toFixed(2)}`);
  }
});

test('faster than par raises ratings, much slower lowers them, but slowness is bounded', () => {
  const run = (pace) => { replaceState(fresh()); IDS.forEach((k) => Object.assign(S.sk[k], { lv: 5, n: 200 })); S.cfg = { dur: 0, only: 'mul' };
    const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(4) }); s.begin(); s.next(); for (let i = 0; i < 60; i++) answerAt(s, c, pace); return S.sk.mul.lv; };
  assert.ok(run(0.6) > 5.5, 'fast raises'); assert.ok(run(0.8) > 5 && run(0.8) < run(0.6) + 1e-9, 'a little fast raises a little');
  assert.ok(run(1.3) < 5 && run(2) <= run(1.3), 'slow lowers, slower lowers more');
  for (const pace of [2, 5, 50]) assert.ok(run(pace) >= 1 && run(pace) <= 12, 'always within the rating range');
});

/* ---------------- convergence: the rating finds a player's true level ---------------- */
function trial(L, start, sessions) {
  replaceState(fresh()); IDS.forEach((k) => (S.sk[k].lv = start)); S.cfg = { dur: 120, only: 'all' };
  const R = seeded(11); let t = 0;
  for (let i = 0; i < sessions; i++) {
    const s = new Session(undefined, { now: () => t, rand: seeded(77 + i) }); s.begin(); s.next();
    for (;;) {
      const need = T(s.cur.sk, s.cur.d, s.cur.a) * Math.exp(0.3 * (s.cur.d - L)) * Math.exp((R() - 0.5) * 0.5);   // par at their level, slower on harder questions
      if (need > 20) { t += 20000; s.tick(); if (s.timedOut) break; s.answer(false); s.next(); continue; }        // gives up on hopeless ones
      t += need * 1000; s.tick(); if (s.timedOut) break;
      solve(s); s.next();
    }
    s.finish();
  }
  return IDS.reduce((a, k) => a + S.sk[k].lv, 0) / IDS.length;
}
test('rating converges to the true level from below and above (within one level in 12 two-minute sessions)', () => {
  assert.ok(Math.abs(trial(8, 5, 12) - 8) < 1.0, 'rises to a fast player\'s level');
  assert.ok(Math.abs(trial(3, 5, 12) - 3) < 1.0, 'falls to a slower player\'s level');
  assert.ok(Math.abs(trial(6, 5, 12) - 6) < 1.0, 'stays near a matched player\'s level');
});

/* ---------------- points and accuracy inside Session.answer ---------------- */
test('points: faster is never worth less, slips/hints/bonus scale as documented', () => {
  const pts = (pace, mod = {}) => {
    replaceState(fresh()); S.cfg = { dur: 0, only: 'mul' };
    const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(5) }); s.begin(); s.next();
    Object.assign(s.cur, { bonus: 0, d: 4 }, mod); s.cur.a = 42; s.cur.q = '6 × 7';
    c.adv(T('mul', 4, 42) * pace * 1000); s.type('4'); s.type('2'); s.answer(true); return s.pts;
  };
  assert.ok(pts(0.5) >= pts(1) && pts(1) >= pts(3));
  assert.equal(pts(1), worth('mul', 4));
  assert.equal(pts(3), worth('mul', 4), 'slow is not penalised in points');
  assert.equal(pts(0.4), Math.round(worth('mul', 4) * 1.25));
  assert.equal(pts(1, { bonus: 1 }), 2 * worth('mul', 4));
  assert.equal(pts(1, { hinted: 1 }), Math.round(worth('mul', 4) * 0.5));
  assert.equal(pts(1, { tries: 1 }), Math.round(worth('mul', 4) * 0.7));
});

test('skill accuracy counts a fixed slip as half, a clean answer as full, a skip as zero', () => {
  const acc = (how) => {
    replaceState(fresh()); IDS.forEach((k) => (S.sk[k].acc = 0.5)); S.cfg = { dur: 0, only: 'add' };
    const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(6) }); s.begin(); s.next(); c.adv(2500);
    if (how == 'skip') s.answer(false);
    else { if (how == 'slip') { for (const d of String(s.cur.a).split('').map((x) => (+x + 1) % 10)) s.type(d); s.back(); } solve(s); }
    return S.sk.add.acc;
  };
  assert.ok(Math.abs(acc('clean') - (0.5 * 0.95 + 0.05)) < 1e-9);
  assert.ok(Math.abs(acc('slip') - (0.5 * 0.95 + 0.025)) < 1e-9);
  assert.ok(Math.abs(acc('skip') - 0.5 * 0.95) < 1e-9);
});

test('a bonus question that goes badly costs no more than a normal one', () => {
  const lvAfter = (bonus) => {
    replaceState(fresh()); S.cfg = { dur: 0, only: 'mul' }; Object.assign(S.sk.mul, { lv: 5, n: 200 });
    const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(8) }); s.begin(); s.next(); s.cur.bonus = bonus; c.adv(T('mul', s.cur.d, s.cur.a) * 3 * 1000); solve(s); return S.sk.mul.lv;
  };
  assert.equal(lvAfter(1), lvAfter(0));
});

/* ---------------- Zetamac estimate ---------------- */
test('Zetamac estimate rises with rating and lands in believable bands', () => {
  replaceState(fresh()); let prev = 0; const E = {};
  for (const lv of [2, 4, 6, 8, 10]) {
    IDS.forEach((k) => (S.sk[k].lv = lv));
    const e = zetaEstimate(S.sk, ['add', 'sub', 'mul', 'div'], { add: 4.5, sub: 4.5, mul: 5, div: 5 }); E[lv] = e;
    assert.ok(e > prev, `estimate must rise with rating (lv ${lv}: ${e})`); prev = e;
  }
  assert.ok(E[2] >= 8 && E[2] <= 22 && E[6] >= 22 && E[6] <= 45 && E[10] >= 50 && E[10] <= 90, JSON.stringify(E));
});

/* ---------------- one-time recovery and migration ---------------- */
test('migration: old data (sessions, no `cal`) is flagged for recovery; new and empty data is not', () => {
  assert.equal(migrate({}).cal, CAL); assert.equal(migrate(null).cal, CAL); assert.equal(fresh().cal, CAL);
  const old = migrate({ sessions: [{ t: 1, dur: 60, n: 5, ok: 5, pts: 50, tm: 2 }], sk: {} });
  assert.equal(old.cal, 0);
  assert.equal(migrate({ ...old, cal: CAL }).cal, CAL);
  assert.equal(mergeStates({ ...old, cal: 0 }, { ...old, cal: CAL, t: 0 }).cal, CAL, 'merge keeps the newer calibration');
});

test('restore: only skills at least 100 below their peak are restored, ratings stay in range', () => {
  replaceState(fresh());
  Object.assign(S.sk.mul, { lv: 1.1, pk: 4.9, n: 80 }); Object.assign(S.sk.div, { lv: 1.3, pk: 5, n: 80 });
  Object.assign(S.sk.add, { lv: 4.3, pk: 4.6, n: 80 });          // only 30 below its peak: left alone
  Object.assign(S.sk.sub, { lv: 1, pk: 5, n: 0 });                // never played: left alone
  assert.deepEqual(lowered().sort(), ['div', 'mul']);
  restoreRatings();
  assert.equal(S.sk.mul.lv, 4.9); assert.equal(S.sk.div.lv, 5); assert.equal(S.sk.add.lv, 4.3); assert.equal(S.sk.sub.lv, 1);
  assert.deepEqual(lowered(), []);
});

test('finishing the recovery resets old-scale speed ratios and pattern timings to neutral, and stamps the calibration', () => {
  replaceState(fresh()); S.cal = 0;
  IDS.forEach((k) => (S.sk[k].spd = 2.4)); S.pat = { 'Multiplication · 2×1 digits': { n: 10, ok: 9, r: 21 }, 'Squares · general': { n: 6, ok: 6, r: 14 } };
  finishCal();
  assert.ok(IDS.every((k) => S.sk[k].spd === 1)); assert.equal(S.pat['Multiplication · 2×1 digits'].r, 9); assert.equal(S.pat['Squares · general'].n, 6); assert.equal(S.cal, CAL);
});

/* ---------------- fuzz: every mode, random play, invariants ---------------- */
test('fuzz: every session mode survives random answers, slips, skips, hints and pauses with sane numbers', () => {
  const modes = [
    [undefined, { dur: 120, only: 'all' }], [undefined, { dur: 60, only: 'mul' }], [undefined, { dur: 0, only: 'pct' }],
    [undefined, { dur: 60, only: 'mix', mix: ['add', 'sq', 'dec'] }], [undefined, { dur: 60, only: 'zeta', zeta: { ops: ['add', 'sub', 'mul', 'div'] } }],
    ['daily'], ['survival'], ['review'],
  ];
  for (const [opt, cfg] of modes) for (let seed = 1; seed <= 6; seed++) {
    replaceState(fresh()); if (cfg) S.cfg = cfg;
    S.weak = { '12 + 15': { q: '12 + 15', a: 27, sk: 'add', d: 3, pt: 'no carry', box: 0, due: 0, at: 1 }, '30 − 7': { q: '30 − 7', a: 23, sk: 'sub', d: 3, pt: '1 borrow', box: 1, due: 0, at: 2 } };
    const R = seeded(seed), c = clock(), s = new Session(opt, { now: c.now, rand: seeded(seed * 13) });
    s.begin(); if (!s.next()) continue;
    let last = 0;
    for (let i = 0; i < 120 && !s.over; i++) {
      c.adv(200 + R() * 9000); s.tick(); if (s.timedOut) break;
      const x = R();
      if (x < 0.05) { s.pause(); c.adv(60000); s.resume(); }
      if (x > 0.93) s.hint();
      if (x < 0.12) { const w = String(s.cur.a).split('').map((d) => (+d + 1 + Math.floor(R() * 8)) % 10).join(''); for (const d of w) s.type(d); if (s.over) break; s.back(); }
      if (x > 0.85 && x <= 0.93) s.answer(false); else solve(s);
      assert.ok(Number.isInteger(s.pts) && s.pts >= last, 'points are whole and never go down'); last = s.pts;
      for (const k of IDS) { const o = S.sk[k]; assert.ok(Number.isFinite(o.lv) && o.lv >= 1 && o.lv <= 12, `${k} lv ${o.lv}`); assert.ok(o.acc >= 0 && o.acc <= 1, 'acc'); assert.ok(Number.isFinite(o.spd) && o.spd > 0, 'spd'); }
      assert.ok(s.ok <= s.n);
      if (!s.next()) break;
    }
    const out = s.finish();
    if (out) { assert.ok(Number.isFinite(out.rec.tm) && out.rec.pts >= 0); assert.ok(out.dl.every((d) => Number.isFinite(d[1]))); }
  }
});
