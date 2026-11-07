// v14.49: negatives, fractions and real-life maths. Answers can carry a minus sign, a slash or a decimal point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDS, CORE, SYM, symFor, gen, how, ansMatch, digitsOf, T, showAns } from '../public/js/engine.js';
import { S, replaceState, fresh, migrate } from '../public/js/state.js';
import { Session, nearMiss } from '../public/js/session.js';
import { seeded, gcd } from '../public/js/util.js';
import { PATHS } from '../public/js/paths.js';

const NEW = ['neg', 'frac', 'life'];
const lowest = (n, m) => { const c = gcd(Math.abs(n), m); n /= c; m /= c; return m == 1 ? String(n) : n + '/' + m; };

/* An independent evaluator per kind: it re-reads the question text and never looks at how the generator built it. */
const FACT = { km: ['m', 1000], h: ['min', 60], kg: ['g', 1000], m: ['cm', 100], L: ['mL', 1000] };
const mins = (t) => { const [h, m] = t.split(':').map(Number); return (h % 12) * 60 + m; };
function expected(p) {
  const q = p.q;
  if (p.sk == 'neg') return +Function('"use strict";return (' + q.replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/') + ')')();
  if (p.sk == 'frac') {
    let m;
    if ((m = /^Simplify (\d+)\/(\d+)$/.exec(q))) return lowest(+m[1], +m[2]);
    if ((m = /^(\d+)\/(\d+) of (\d+)$/.exec(q))) return +m[1] * +m[3] / +m[2];
    m = /^(\d+)\/(\d+) ([+−×÷]) (\d+)\/(\d+)$/.exec(q);
    const [n1, d1, n2, d2] = [+m[1], +m[2], +m[4], +m[5]];
    if (m[3] == '+') return lowest(n1 * d2 + n2 * d1, d1 * d2);
    if (m[3] == '−') return lowest(n1 * d2 - n2 * d1, d1 * d2);
    if (m[3] == '×') return lowest(n1 * n2, d1 * d2);
    return lowest(n1 * d2, d1 * n2);
  }
  let m;
  if ((m = /^(\d+)% tip on \$(\d+)$/.exec(q))) return +m[1] * +m[2] / 100;
  if ((m = /^(\d+)% off \$(\d+)$/.exec(q))) return +m[2] * (100 - +m[1]) / 100;
  if ((m = /^([\d.]+) (\w+) in (\w+)$/.exec(q))) { const x = +m[1], [a, b] = [m[2], m[3]]; return FACT[a] && FACT[a][0] == b ? x * FACT[a][1] : x / FACT[b][1]; }
  if ((m = /^Minutes from ([\d:]+) to ([\d:]+)$/.exec(q))) return ((mins(m[2]) - mins(m[1])) + 720) % 720;
  if ((m = /^Recipe: (\d+) g for (\d+)\. For (\d+)\?$/.exec(q))) return +m[1] * +m[3] / +m[2];
  if ((m = /^Ratio (\d+):(\d+)\. First is (\d+)\. Second\?$/.exec(q))) return +m[3] / +m[1] * +m[2];
  if ((m = /^([\d.]+) km in ([\d.]+) h\. km\/h\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^(\d+) for \$([\d.]+)\. Price of one\?$/.exec(q))) return +m[2] / +m[1];
  if ((m = /^Split \$(\d+) between (\d+)$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^\$(\d+) plus (\d+)% tax$/.exec(q))) return +m[1] * (100 + +m[2]) / 100;
  if ((m = /^(\d+)% off, then (\d+)% off \$(\d+)$/.exec(q))) return +m[3] * (100 - +m[1]) * (100 - +m[2]) / 10000;
  throw new Error('unrecognised question: ' + q);
}
const same = (a, b) => (typeof b == 'string' ? String(a) === b : Math.abs(+a - b) < 1e-9);

test('every new-skill answer is right, exact and in the expected shape, at every level', () => {
  for (const k of NEW) for (let d = 1; d <= 12; d += 0.5) for (let i = 0; i < 250; i++) {
    const p = gen(k, d), e = expected(p);
    assert.ok(same(p.a, e), `${k} d=${d}: ${p.q} = ${p.a}, expected ${e}`);
    assert.ok(p.pt && p.tip, 'pattern label and tip present');
    assert.notEqual(+p.a, 0, `${p.q}: a zero answer is too easy to guess`);
    if (k == 'neg') assert.ok(Number.isInteger(p.a), p.q);
    if (k == 'frac') assert.match(String(p.a), /^\d+$|^[1-9]\d*\/[2-9]\d*$|^[1-9]\d*\/\d{2,}$/, p.q + ' answer in lowest terms');
    if (k == 'frac' && typeof p.a == 'string') { const [n, m] = p.a.split('/').map(Number); assert.equal(gcd(n, m), 1, p.q + ' not in lowest terms'); }
    if (k == 'life') { const t = String(p.a); assert.equal(t, String(+(+p.a).toFixed(2)), `${p.q} = ${t}: more than two decimals or float noise`); assert.ok(+p.a > 0, p.q); }
  }
});

test('each new skill produces several distinct patterns and uses its own symbol key only when it needs one', () => {
  for (const k of NEW) {
    const pts = new Set(); for (let d = 1; d <= 12; d++) for (let i = 0; i < 300; i++) pts.add(gen(k, d).pt);
    assert.ok(pts.size >= 5, `${k}: only ${[...pts].join(', ')}`);
  }
  assert.deepEqual(SYM, { neg: '-', frac: '/', life: '.' });
  assert.equal(symFor('mul'), ''); assert.equal(symFor('neg'), '-');
  // the symbol an answer needs is always the skill's own, and a skill never needs another one
  for (const k of NEW) for (let i = 0; i < 1500; i++) { const t = String(gen(k, 1 + (i % 12)).a); for (const c of t.replace(/\d/g, '')) assert.equal(c, SYM[k], `${k}: ${t}`); }
});

test('negatives are really negative sometimes, fractions sometimes whole, and difficulty grows', () => {
  const as = Array.from({ length: 2000 }, (_, i) => gen('neg', 6 + (i % 4)).a);
  assert.ok(as.some((a) => a < 0) && as.some((a) => a > 0));
  const fr = Array.from({ length: 2000 }, (_, i) => gen('frac', 8 + (i % 4)).a);
  assert.ok(fr.some((a) => typeof a == 'string') && fr.some((a) => typeof a == 'number'));
  const avg = (k, d) => Array.from({ length: 400 }, () => Math.abs(+String(gen(k, d).q.match(/\d+/)))).reduce((x, y) => x + y) / 400;
  assert.ok(avg('neg', 11) > avg('neg', 2) * 2);
  assert.ok(T('neg', 12) > T('neg', 1) && T('frac', 12) > T('frac', 1) && T('life', 12) > T('life', 1));
});

test('worked methods exist for every new pattern and state the answer', () => {
  const seen = new Set();
  for (const k of NEW) for (let d = 1; d <= 12; d++) for (let i = 0; i < 200; i++) {
    const p = gen(k, d), h = how(p); seen.add(p.pt);
    assert.ok(h.length > 5, `${p.q}: no worked method`);
    assert.ok(h.includes(String(p.a)) || h.includes(showAns(p.a)), `${p.q} = ${p.a} → ${h}`);
    assert.ok(!/NaN|undefined|Infinity|0\.\d{6,}/.test(h), `${p.q} → ${h}`);
  }
  assert.ok(seen.size >= 15);
});

test('ansMatch: exact text, same-valued decimals, equal fractions of the same length; never half-typed answers', () => {
  assert.ok(ansMatch('12', 12) && ansMatch('-7', -7) && ansMatch('3/4', '3/4') && ansMatch('6.3', 6.3));
  assert.ok(ansMatch('.5', 0.5) && ansMatch('6.30', 6.3) && ansMatch('6/8', '3/4') && ansMatch('2/4', '1/2'));
  assert.ok(!ansMatch('012', 12), 'whole answers stay strict');
  assert.ok(!ansMatch('3/', '3/4') && !ansMatch('3', '3/4') && !ansMatch('6.', 6) && !ansMatch('-', -7) && !ansMatch('', 5));
  assert.ok(!ansMatch('3/5', '3/4') && !ansMatch('7', -7) && !ansMatch('6.4', 6.3));
  assert.ok(!ansMatch('10/20', '1/2'), 'a longer equal fraction is not accepted in auto-submit');
  assert.ok(!ansMatch('1/0', '3/4') && !ansMatch('3/4', '0/0'));
});

test('digitsOf counts the keystrokes of a sign, point and slash, and leaves the old skills alone', () => {
  assert.equal(digitsOf(144), 3); assert.equal(digitsOf(0), 1); assert.equal(digitsOf('27'), 2);
  assert.equal(digitsOf(-14), 3); assert.equal(digitsOf(6.3), 3); assert.equal(digitsOf('13/10'), 5);
});

/* ---------- typing through the real Session ---------- */
const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const mk = (p, opts = {}) => { const c = clock(), s = new Session(undefined, { now: c.now }); s.begin(); s.cur = { ...p }; s.qs = 0; s.buf = ''; s.grace = 0; s.lives = opts.lives || 0; return s; };

test('typing the answer key by key succeeds exactly at the last key, for every new skill and level', () => {
  replaceState({});
  for (const k of NEW) for (let d = 1; d <= 12; d++) for (let i = 0; i < 80; i++) {
    const p = gen(k, d), s = mk(p), t = String(p.a);
    for (let j = 0; j < t.length; j++) { const r = s.type(t[j]); assert.equal(r, j == t.length - 1 ? 'ok' : 'more', `${p.q} = ${t}: key ${j} gave ${r}`); }
  }
});

test('a symbol key only works on a question that uses it, and the minus sign is not leaked by the keypad', () => {
  replaceState({});
  const add = mk({ q: '2 + 3', a: 5, sk: 'add', d: 1 });
  assert.equal(add.type('-'), 'more'); assert.equal(add.buf, '', 'minus ignored on a question with no minus');
  assert.equal(add.type('/'), 'more'); assert.equal(add.type('.'), 'more'); assert.equal(add.buf, '');
  const neg = mk({ q: '−3 + 19', a: 16, sk: 'neg', d: 1 });
  assert.equal(neg.type('-'), 'more'); assert.equal(neg.buf, '-', 'a positive answer can still be started with a minus: the key does not give the sign away');
  assert.equal(neg.type('.'), 'more'); assert.equal(neg.buf, '-', 'the point is not this skill\'s key');
  assert.equal(mk({ q: '−3 + 9', a: 6, sk: 'neg', d: 1 }).type('-'), 'bad', 'a minus where the answer is positive is simply a wrong answer');
  const life = mk({ q: '10% tip on $50', a: 5, sk: 'life', d: 1 });
  assert.equal(life.type('-'), 'more'); assert.equal(life.buf, '');
});

test('wrong answers with symbols slip like any other, equal fractions pass, and typos are forgiven the same way', () => {
  replaceState({ noGrace: true });
  assert.equal(mk({ q: 'Simplify 6/8', a: '3/4', sk: 'frac', d: 1 }, { lives: 3 }).type('3') , 'more');
  const f = mk({ q: 'Simplify 6/8', a: '3/4', sk: 'frac', d: 1 }, { lives: 3 }); f.type('3'); f.type('/'); assert.equal(f.type('5'), 'bad'); assert.equal(f.lives, 2);
  const e = mk({ q: 'Simplify 6/8', a: '3/4', sk: 'frac', d: 1 }); for (const c of '6/8'.slice(0, 2)) e.type(c); assert.equal(e.type('8'), 'ok', 'an equal fraction of the same length is accepted');
  const n = mk({ q: '−3 − 9', a: -12, sk: 'neg', d: 1 }, { lives: 3 }); n.type('-'); n.type('1'); assert.equal(n.type('3'), 'bad');
  replaceState({});
  const g = mk({ q: '−3 − 9', a: -12, sk: 'neg', d: 1 }, { lives: 3 }); g.type('-'); g.type('1');
  assert.equal(g.type('3'), 'near', 'a neighbouring last digit gets the grace window on a negative answer too');
  assert.equal(g.type('2'), 'ok'); assert.equal(g.slips, 0);
  assert.ok(nearMiss('-12', '-13') && nearMiss('3/4', '3/5') && nearMiss('6.3', '6.2') && !nearMiss('3/4', '3/9'));
});

test('Enter-to-submit works with symbols and equal decimals', () => {
  replaceState({ ent: true });
  const s = mk({ q: '10% tip on $62', a: 6.2, sk: 'life', d: 1 });
  for (const c of '6.20') s.type(c);
  assert.equal(s.submit(), 'ok', '6.20 is 6.2');
  const t = mk({ q: '−3 − 9', a: -12, sk: 'neg', d: 1 }); for (const c of '12') t.type(c);
  assert.equal(t.submit(), 'bad', 'forgetting the minus is a slip');
});

/* ---------- integration with the rest of the app ---------- */
test('the Daily challenge still draws from the original ten skills only, and stays deterministic', () => {
  replaceState(fresh());
  const run = (seed) => { const s = new Session('daily', { now: () => 0, rand: seeded(seed) }); s.begin(); return Array.from({ length: 40 }, () => { s.next(); return s.cur; }); };
  const a = run(20261107).map((p) => p.sk);
  assert.ok(a.every((k) => CORE.includes(k)), 'no symbol keys in the Daily');
  assert.deepEqual(run(20261107).map((p) => p.q), run(20261107).map((p) => p.q));
});

test('the all-skills mix serves the new skills too, and every skill has a guided path', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'all' };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) }); s.begin();
  const seen = new Set(); for (let i = 0; i < 300; i++) { s.next(); seen.add(s.cur.sk); }
  assert.deepEqual([...seen].sort(), [...IDS].sort());
  for (const k of NEW) assert.equal(PATHS[k].stages.length, 5);
  for (const k of NEW) assert.ok(PATHS[k].stages[2].tr.length >= 1 && PATHS[k].stages[2].p.length >= 3, k + ' has pattern drills');
});

test('data saved before 14.49 gains the new skills at their starting level and keeps everything else', () => {
  const old = migrate({ v: 1, sk: { add: { lv: 7, n: 90, acc: 0.9, spd: 0.8 } }, sessions: [{ t: 5, dur: 60, n: 10, ok: 9, pts: 100, tm: 2 }] });
  for (const k of IDS) assert.ok(old.sk[k] && Number.isFinite(old.sk[k].lv), k);
  assert.equal(old.sk.add.lv, 7); assert.equal(old.sessions.length, 1);
  for (const k of NEW) assert.ok(old.sk[k].lv >= 1 && old.sk[k].lv <= 12);
});

test('weak-notebook rows with signed, fraction and decimal answers survive migrate and review', () => {
  const w = { '−3 − 9': { q: '−3 − 9', a: -12, sk: 'neg', d: 2, pt: 'both negative', box: 0, due: 0, at: 1 }, 'Simplify 6/8': { q: 'Simplify 6/8', a: '3/4', sk: 'frac', d: 2, pt: 'simplify', box: 0, due: 0, at: 1 }, '10% tip on $62': { q: '10% tip on $62', a: 6.2, sk: 'life', d: 2, pt: 'friendly tip', box: 0, due: 0, at: 1 } };
  const m = migrate({ v: 1, sk: {}, sessions: [], weak: w });
  assert.deepEqual(Object.keys(m.weak).sort(), Object.keys(w).sort());
  assert.equal(m.weak['−3 − 9'].a, -12); assert.equal(m.weak['Simplify 6/8'].a, '3/4'); assert.equal(m.weak['10% tip on $62'].a, 6.2);
});

const rd = (p) => readFileSync(new URL('../public/js/' + p, import.meta.url), 'utf8');
test('wiring: the extra key sits in the pad, keyboard symbols are routed, the soft keyboard switches, Learn uses the same matching', () => {
  const p = rd('views/play.js');
  assert.match(p, /id="symk"/); assert.match(p, /\^\[-−\.\/\]\$/); assert.match(p, /kin\.inputMode = sym \? 'text' : 'numeric'/);
  assert.match(p, /showAns\(sess\.buf\)/);
  assert.match(rd('views/learn.js'), /ansMatch\(inp\.value\.trim\(\)\.replace\(\/−\/g, '-'\), p\.a\)/);
  assert.match(rd('session.js'), /ansMatch\(this\.buf, ans\)/);
  assert.match(rd('views/home.js'), /neg: 'Negatives', frac: 'Fractions', life: 'Real-life'/);
});
