import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProblem, within, pctOff, accepted, fmtExact, estPts, estKey, KINDS, LEVELS, TOLS } from '../public/js/estimate.js';

const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('every kind and level makes a well-formed question whose exact answer is at least 20', () => {
  for (const k of [...KINDS, 'mix']) for (const l of LEVELS) {
    const r = seeded(7 + l);
    for (let i = 0; i < 300; i++) {
      const p = makeProblem({ k, l }, r);
      assert.ok(p.exact >= 20 && Number.isFinite(p.exact), `${k}/${l}: ${p.text} = ${p.exact}`);
      assert.ok(p.text.length && p.say.length);
      if (k != 'mix') assert.equal(p.kind, k);
    }
  }
});

test('the exact answer matches the question that is shown', () => {
  const r = seeded(3);
  for (let i = 0; i < 400; i++) {
    const p = makeProblem({ k: 'mix', l: 2 }, r), t = p.text;
    let want;
    if (p.kind == 'mul') { const [a, b] = t.split(' × ').map(Number); want = a * b; }
    else if (p.kind == 'div') { const [a, b] = t.split(' ÷ ').map(Number); want = a / b; }
    else if (p.kind == 'add') want = t.split(' + ').map(Number).reduce((a, b) => a + b, 0);
    else { const m = /^(\d+)% of (\d+)$/.exec(t); want = (m[1] * m[2]) / 100; }
    assert.ok(Math.abs(p.exact - want) < 1e-9, t);
  }
});

test('within(): inclusive at the edge, and relative to the exact value', () => {
  assert.equal(within(1100, 1000, 10), true);    // exactly +10 %
  assert.equal(within(1101, 1000, 10), false);
  assert.equal(within(900, 1000, 10), true);
  assert.equal(within(899, 1000, 10), false);
  assert.equal(within(1050, 1000, 5), true);
  assert.equal(within(1051, 1000, 5), false);
  assert.equal(within(40, 33.6, 20), true);      // a fractional exact answer
  assert.equal(within(41, 33.6, 20), false);
  assert.equal(within(0.1 * 3 * 10, 3 * 10 * 0.1 * 10 / 10, 5), true);   // no float drift at the edge
});

test('pctOff signs, accepted range and formatting', () => {
  assert.equal(pctOff(1100, 1000), 10); assert.equal(pctOff(900, 1000), -10); assert.equal(pctOff(1000, 1000), 0);
  assert.deepEqual(accepted(1000, 10), [900, 1100]);
  assert.deepEqual(accepted(33.6, 20), [27, 40]);
  assert.deepEqual(accepted(20, 5), [19, 21]);
  assert.equal(fmtExact(1776), '1776'); assert.equal(fmtExact(108.84), '108.8'); assert.equal(fmtExact(20.0), '20');
});

test('accepted() agrees with within() for every whole number near the answer', () => {
  const r = seeded(11);
  for (let i = 0; i < 200; i++) {
    const p = makeProblem({ k: 'mix', l: 1 + (i % 3) }, r), t = TOLS[i % 3], [lo, hi] = accepted(p.exact, t);
    for (const g of [lo - 1, lo, hi, hi + 1]) assert.equal(within(g, p.exact, t), g >= lo && g <= hi, `${p.text} ±${t} guess ${g}`);
  }
});

test('points and best keys: harder and tighter pay more; each setting has its own key', () => {
  assert.ok(estPts({ l: 3, t: 5 }) > estPts({ l: 3, t: 10 }) && estPts({ l: 3, t: 10 }) > estPts({ l: 3, t: 20 }));
  assert.ok(estPts({ l: 3, t: 10 }) > estPts({ l: 1, t: 10 }));
  assert.equal(estPts({ l: 2, t: 10 }), 20);
  assert.notEqual(estKey({ k: 'mul', l: 1, t: 10 }), estKey({ k: 'mul', l: 1, t: 5 }));
});

import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
test('Estimate is wired: route, home tile, saved as kind est and kept out of pace charts, offline shell', () => {
  assert.match(rd('js/views/estimate.js'), /register\('est', setup\)/);
  assert.match(rd('js/views/estimate.js'), /m: 'est'/);
  assert.match(rd('js/views/home.js'), /data-act="est"/);
  assert.match(rd('js/main.js'), /import '\.\/views\/estimate\.js'/);
  assert.match(rd('js/views/progress.js'), /s\.m != 'est'/);
  assert.match(rd('js/stats.js'), /isPace = \(s\) => s\.m != 'flash' && s\.m != 'est'/);
  assert.match(rd('js/stats.js'), /est: 'Estimate'/);
  for (const f of ['js/estimate.js', 'js/views/estimate.js']) assert.ok(rd('sw.js').includes(`'${f}'`), f);
});
test('Estimate counts toward the daily goal at 5 right, not before', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { countsToGoal } = await import('../public/js/stats.js');
  assert.equal(countsToGoal({ m: 'est', ok: 5, dur: 40 }), true);
  assert.equal(countsToGoal({ m: 'est', ok: 4, dur: 400 }), false);
  assert.equal(countsToGoal({ m: 'est', ok: 0, dur: 400 }), false);
});
