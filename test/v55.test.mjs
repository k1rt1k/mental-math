// 5.5: slow answers at the top levels, level-up spam, free questions, decimal difficulty, honest accuracy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, T, gen, how, timeCap, perfScore, nextRating } from '../public/js/engine.js';
import { S, replaceState } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { coach, records, ctx } from '../public/js/stats.js';
import { seeded } from '../public/js/util.js';

const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const solve = (s) => { for (const d of String(s.cur.a)) if (s.type(d) == 'ok') return s.answer(true); };

test('REGRESSION: taking 40 s on a hard question never raises a rating (the old 15 s cap sat below level-12 multi-step par of 16 s)', () => {
  for (const k of IDS) for (const d of [8, 10, 12]) {
    const par = T(k, d, 1000), tm = Math.min(40, timeCap(par)), sc = perfScore(true, tm / par, 0);
    assert.ok(nextRating({ lv: 10, n: 200 }, sc, 0) <= 10, `${k} d${d}: par ${par.toFixed(1)}s, 40 s answer scored ${sc.toFixed(2)}`);
  }
  assert.ok(timeCap(2) == 15 && timeCap(16) == 40, 'easy questions keep the 15 s cap, hard ones scale with par');
});

test('in a real session a very slow answer on level-12 multi-step lowers the rating', () => {
  replaceState({}); S.sk.ops.lv = 12; S.sk.ops.n = 500;
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) }); s.begin();
  s.cur = { q: '(900 − 88) × 47', a: 38164, sk: 'ops', d: 12, pt: '', tip: '' }; s.qs = c.now();
  c.adv(40e3); s.tick(); solve(s);
  assert.ok(S.sk.ops.lv < 12, 'rating fell');
});

test('a slip you then fix costs 30% of that answer\'s score, so a fixed mistake still counts as a mistake', () => {
  assert.ok(Math.abs(perfScore(true, 1, 1) - 0.72 * 0.7) < 1e-9);
  assert.ok(Math.abs(perfScore(true, 0.5, 2) - 0.4) < 1e-9, 'two slips bottom out at 40%');
});

test('level-up fires only for a NEW peak, not when a rating wobbles back across a boundary it already reached', () => {
  replaceState({});
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(5) }); s.begin(); s.next();
  const fast = () => { s.cur.bonus = 0; s.cur.rt = 0; c.adv(300); s.tick(); return solve(s); };
  S.sk[s.cur.sk].lv = 4.97; S.sk[s.cur.sk].pk = 5.4; S.sk[s.cur.sk].n = 200;      // was at 540 before, now 497
  const r1 = fast(); assert.ok(S.sk[r1.p.sk].lv >= 5, 'crossed 500 again'); assert.equal(r1.lvl, '', 'but it is not a level-up');
  assert.equal(s.lu.length, 0);
  s.next(); S.sk[s.cur.sk].lv = 5.97; S.sk[s.cur.sk].pk = 5.97; S.sk[s.cur.sk].n = 200;
  const r2 = fast(); assert.ok(r2.lvl.includes('600'), 'a genuinely new peak is announced: ' + r2.lvl);
});

test('first answers on a fresh account never announce a level-up', () => {
  replaceState({});
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(9) }); s.begin();
  for (let i = 0; i < 4; i++) { s.next(); c.adv(300); s.tick(); const r = solve(s); if (i == 0) assert.equal(r.lvl, '', 'no phantom level-up on answer #1'); }
});

test('no free questions: nothing × 100, no ÷ giving 100, no mod 10, no 100² / 200²', () => {
  const R = seeded(11);
  for (let d = 1; d <= 12; d += 0.5) for (let i = 0; i < 1500; i++) {
    const m = gen('mul', d, R), v = gen('div', d, R), s = gen('sq', d, R), o = gen('mod', d, R);
    assert.ok(!/(^| )(100|200|300|400|500) ?(×|$)|× (100|200|300)$/.test(m.q) && !m.q.split(' × ').some((x) => +x % 100 == 0), m.q);
    assert.notEqual(v.a, 100, v.q); assert.ok(+v.q.split(' ÷ ')[1] % 100 != 0, v.q);
    assert.ok(s.q != '100²' && s.q != '200²', s.q);
    assert.ok(!/ mod 10$/.test(o.q), o.q);
  }
});

test('decimals: no "1 ÷ 0.1" style freebies, easy levels stay small, every answer whole and checked', () => {
  const R = seeded(13);
  for (let d = 1; d <= 12; d += 0.5) for (let i = 0; i < 1500; i++) {
    const p = gen('dec', d, R);
    assert.ok(Number.isInteger(p.a) && p.a >= 2, p.q + ' = ' + p.a);
    if (d < 3) assert.ok(p.a <= 9900, 'level ' + d + ' answer too large: ' + p.q);
    const n = p.q.match(/\d+(?:\.\d+)?/g).map(Number), sm = { '×': (a, b) => a * b, '÷': (a, b) => a / b, '+': (a, b) => a + b };
    const op = p.q.match(/[×÷+]/)[0];
    assert.ok(Math.abs(sm[op](n[0], n[1]) - p.a) < 1e-9, p.q + ' ≠ ' + p.a);
  }
});

test('"decimal × whole" appears from level 6, gets a worked method, and its answer is whole', () => {
  const R = seeded(17); let seen = 0;
  for (let i = 0; i < 3000; i++) { const p = gen('dec', 8, R); if (p.pt == 'decimal × whole') { seen++; assert.match(how(p), /Ignore the point/); assert.ok(Number.isInteger(p.a)); } }
  assert.ok(seen > 400, 'common at level 8: ' + seen);
  for (let i = 0; i < 1500; i++) assert.notEqual(gen('dec', 2, R).pt, 'decimal × whole', 'not at level 2');
});

test('worked methods never print ugly or empty text for decimals and mod', () => {
  const R = seeded(19);
  for (const k of ['dec', 'mod']) for (let d = 1; d <= 12; d += 0.5) for (let i = 0; i < 800; i++) {
    const p = gen(k, d, R), h = how(p);
    assert.ok(h.length > 5, p.q); assert.ok(!/0\.6667|1\.3333|NaN|undefined/.test(h), p.q + ' → ' + h);
    assert.ok(!/-\d/.test(h), 'use the real minus sign: ' + h);
  }
});

test('mod-11 explanation shows the alternating sum and lands on the right answer', () => {
  const h = how({ q: '163 mod 11', a: 9, sk: 'mod', d: 5, pt: 'alternating-sum trick' });
  assert.match(h, /3 − 6 \+ 1 = −2/); assert.match(h, /mod 11 = 9/);
});

test('misses in the results screen keep their pattern, so their worked method matches the question', () => {
  replaceState({});
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(23) }); s.begin(); s.next();
  s.cur = { q: '3.2 × 50', a: 160, sk: 'dec', d: 8, pt: 'decimal × whole', tip: '' }; s.qs = c.now(); c.adv(2000); s.answer(false);
  assert.equal(s.log[0].pt, 'decimal × whole'); assert.match(how(s.log[0]), /Ignore the point/);
});

test('sessions record first-try answers, and the coach, perfect-session and best-accuracy use them', () => {
  replaceState({ noGrace: true });   // this test is about real slips; the near-miss grace window has its own tests
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(29) }); s.begin();
  for (let i = 0; i < 30; i++) { s.next(); c.adv(2000); s.tick(); if (i % 2) s.type(String(s.cur.a).replace(/./g, (x) => (+x + 1) % 10)); solve(s); }
  assert.equal(s.ok, 30); assert.equal(s.ft, 15);
  const out = s.finish(); assert.equal(out.rec.ft, 15);
  assert.equal(ctx().perf, false, '30 answers with 15 slips is not a perfect session');
  assert.ok(/50% were right first time/.test(coach(s)), coach(s));
  assert.equal(records().find((r) => r[0].startsWith('Best first-try'))[1], '50%');
  S.sessions.push({ t: 1, dur: 120, n: 30, ok: 30, ft: 30, pts: 1, tm: 2, m: 'train' });
  assert.equal(ctx().perf, true);
  S.sessions = [{ t: 2, dur: 120, n: 30, ok: 30, pts: 1, tm: 2, m: 'train' }];      // sessions saved before 5.5 have no ft
  assert.equal(ctx().perf, true, 'old data keeps its old meaning');
});
