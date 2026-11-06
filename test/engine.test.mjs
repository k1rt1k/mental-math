import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, gen, how, SK, T, perfScore, nextRating, qk } from '../public/js/engine.js';
import { seeded } from '../public/js/util.js';

// Independent evaluator for the question strings (does not share code with the generators).
const evalQ = (q) => {
  let m;
  if ((m = q.match(/^(\d+)% of (\d+)$/))) return (+m[1] * +m[2]) / 100;
  if ((m = q.match(/^(\d+)²$/))) return m[1] ** 2;
  if ((m = q.match(/^(\d+)³$/))) return m[1] ** 3;
  if ((m = q.match(/^√(\d+)$/))) return Math.sqrt(+m[1]);
  if ((m = q.match(/^∛(\d+)$/))) return Math.round(Math.cbrt(+m[1]));
  if ((m = q.match(/^(\d+) mod (\d+)$/))) return +m[1] % +m[2];
  const r = (v) => Math.round(v * 1e6) / 1e6;                       // decimals: 0.1 * 30 is 3.0000000000000004 in floating point
  if (q.includes('÷')) { const [x, y] = q.split(' ÷ ').map(Number); return r(x / y); }
  return r(Function('"use strict";return (' + q.replaceAll('×', '*').replaceAll('−', '-') + ')')());
};

test('every generated question has the right integer answer', () => {
  for (const k of IDS) for (let d = 1; d <= 12; d += 0.5) for (let i = 0; i < 200; i++) {
    const p = gen(k, d);
    assert.equal(evalQ(p.q), p.a, `${k} d=${d}: ${p.q}`);
    assert.ok(Number.isInteger(p.a) && p.a > 0, `${p.q} = ${p.a}`);
    assert.ok(p.pt, 'pattern label present');
  }
});

test('worked methods mention the answer', () => {
  for (const k of IDS) for (let d = 1; d <= 12; d += 1.5) for (let i = 0; i < 100; i++) {
    const p = gen(k, d), h = how(p);
    assert.ok(h.includes(String(p.a)), `${p.q} → "${h}"`);
  }
});

test('difficulty grows: higher d gives bigger or equal operands on average', () => {
  const avg = (k, d) => Array.from({ length: 300 }, () => gen(k, d).a).reduce((a, b) => a + b) / 300;
  for (const k of ['add', 'mul', 'sq']) assert.ok(avg(k, 10) > avg(k, 2), k);
});

test('daily generation is deterministic for a seed', () => {
  const run = (s) => { const R = seeded(s); return Array.from({ length: 20 }, () => gen(IDS[Math.floor(R() * IDS.length)], 6, R).q); };
  assert.deepEqual(run(20261101), run(20261101));
  assert.notDeepEqual(run(20261101), run(20261102));
});

test('scoring and rating updates behave', () => {
  assert.equal(perfScore(false, 0.5), 0);
  assert.equal(perfScore(true, 0.5), 1);
  assert.ok(perfScore(true, 1.5) < 1 && perfScore(true, 1.5) > perfScore(true, 3));
  assert.ok(perfScore(true, 0.5, 2) < 1);
  const s = { lv: 5, n: 10 };
  assert.ok(nextRating(s, 1) > 5);
  assert.ok(nextRating(s, 0) < 5);
  assert.equal(nextRating({ lv: 12, n: 500 }, 1), 12);
  assert.equal(nextRating({ lv: 1, n: 500 }, 0), 1);
});

test('qk treats a+b and b+a as the same question', () => {
  assert.equal(qk('3 + 5'), qk('5 + 3'));
  assert.equal(qk('7 × 9'), qk('9 × 7'));
  assert.notEqual(qk('7 − 3'), qk('3 − 7'));
});

test('target times are positive and grow with difficulty', () => {
  for (const k of IDS) { assert.ok(T(k, 1) > 0); assert.ok(T(k, 12) > T(k, 1)); assert.ok(SK[k].n); }
});

import { genZeta, zNorm, zKey, zLabel, ZDEF } from '../public/js/engine.js';
test('custom ranges: answers are whole, in range, and honour the chosen operations', () => {
  const z = { ops: ['add', 'sub', 'mul', 'div'], a: [10, 20], b: [3, 9], m: [6, 8], n: [2, 12] };
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const p = genZeta(z); seen.add(p.sk);
    assert.equal(evalQ(p.q), p.a, p.q); assert.ok(Number.isInteger(p.a) && p.a >= 0, p.q);
    const n = p.q.match(/\d+/g).map(Number);
    if (p.sk == 'add') assert.ok(n[0] >= 10 && n[0] <= 20 && n[1] >= 3 && n[1] <= 9, p.q);
    if (p.sk == 'sub') assert.ok(p.a >= 3 && p.a <= 9 && n[1] >= 10 && n[1] <= 20, p.q);
    if (p.sk == 'mul') assert.ok(n[0] >= 6 && n[0] <= 8 && n[1] >= 2 && n[1] <= 12, p.q);
    if (p.sk == 'div') assert.ok(n[1] >= 6 && n[1] <= 8 && p.a >= 2 && p.a <= 12, p.q);
  }
  assert.equal(seen.size, 4);
  for (let i = 0; i < 200; i++) assert.equal(genZeta({ ops: ['mul'], a: [1, 1], b: [1, 1], m: [7, 7], n: [2, 12] }).q.startsWith('7 × '), true);
});
test('custom ranges: bad input is repaired, never crashes', () => {
  assert.deepEqual(zNorm({ ops: [], a: [50, 10], b: ['x', null], m: undefined }).ops, ['add']);
  assert.deepEqual(zNorm({ a: [50, 10] }).a, [10, 50]);
  assert.deepEqual(zNorm(null), zNorm(ZDEF));
  assert.equal(zNorm({ a: [-5, 100000] }).a[0], 0);
  assert.notEqual(zKey({ ops: ['add'] }), zKey({ ops: ['mul'] }));
  assert.equal(zLabel({ ops: ['mul', 'div'], m: [7, 7] }), '7× table');
  genZeta({ ops: ['div'], m: [0, 0], n: [0, 0] });      // zero divisor must not throw
});

test('new skills: remainders are never 0, decimals always show a decimal point where promised, and every skill has a trick-linked pattern', () => {
  for (let d = 1; d <= 12; d += 1) for (let i = 0; i < 300; i++) {
    const m = gen('mod', d); assert.ok(m.a > 0 && m.a < +m.q.split(' mod ')[1], m.q);
    const x = gen('dec', d);
    if (x.pt == 'move the point') assert.ok(/\./.test(x.q.split(' × ')[0]), x.q);
    if (x.pt == 'tenths' || x.pt == 'hundredths') assert.ok(/\./.test(x.q), x.q);
  }
});

test('every trick that names a pattern can actually be generated (so "Practise this" never spins)', async () => {
  const { TRICKS } = await import('../public/js/tricks.js');
  for (const t of TRICKS.filter((x) => x.pt)) {
    let hit = false;
    for (let d = 1; d <= 12 && !hit; d++) for (let i = 0; i < 400 && !hit; i++) hit = gen(t.sk, d).pt == t.pt;
    assert.ok(hit, `${t.id}: no ${t.sk} question has pattern "${t.pt}"`);
  }
});
