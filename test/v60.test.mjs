// 6.0: times-table map, today's plan, crash recovery, par readout, rating movers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { factOf, gen } from '../public/js/engine.js';
import { S, replaceState, mergeStates } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { plan, factClass } from '../public/js/stats.js';
import { seeded } from '../public/js/util.js';

const src = (f) => fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');

test('factOf: × and ÷ inside the 2..12 table map to one symmetric key; everything else is ignored', () => {
  assert.equal(factOf('7 × 8'), '7×8'); assert.equal(factOf('8 × 7'), '7×8');
  assert.equal(factOf('56 ÷ 7'), '7×8'); assert.equal(factOf('56 ÷ 8'), '7×8');
  for (const q of ['13 × 4', '1 × 5', '47 × 38', '100 ÷ 7', '7 + 8', '3²', '84 ÷ 12']) assert.ok(q == '84 ÷ 12' ? factOf(q) == '7×12' : factOf(q) == '', q);
});

test('every generated mul/div question maps to a fact or to nothing, never throws or yields a malformed key', () => {
  const R = seeded(5);
  for (const k of ['mul', 'div']) for (let d = 1; d <= 12; d++) for (let i = 0; i < 200; i++) assert.match(factOf(gen(k, d, R).q) || '2×2', /^\d+×\d+$/);
});

test('a session records table facts (first-time answers only; hints and review retries are not counted)', () => {
  replaceState({});
  const s = new Session(undefined, { rand: seeded(1) }); s.begin();
  s.next(); s.cur = { q: '7 × 8', a: 56, sk: 'mul', d: 3 }; s.qs = s.now();
  for (const c of '56') s.type(c); s.answer(true);
  assert.equal(S.facts['7×8'].n, 1); assert.equal(S.facts['7×8'].ok, 1);
  s.cur = { q: '56 ÷ 7', a: 8, sk: 'div', d: 3, hinted: 1 }; s.answer(true);
  s.cur = { q: '56 ÷ 8', a: 7, sk: 'div', d: 3, rt: 1 }; s.answer(true);
  assert.equal(S.facts['7×8'].n, 1, 'hinted and retried answers are skipped');
  s.cur = { q: '8 × 7', a: 56, sk: 'mul', d: 3 }; s.answer(false);
  assert.equal(S.facts['7×8'].n, 2); assert.equal(S.facts['7×8'].ok, 1);
});

test('facts merge: the side that has seen a fact more wins, nothing is lost, and old data without facts loads', () => {
  const a = { sk: {}, sessions: [], facts: { '2×3': { n: 5, ok: 5, r: 4 }, '4×5': { n: 1, ok: 0, r: 0 } } };
  const b = { sk: {}, sessions: [], facts: { '2×3': { n: 2, ok: 1, r: 1 }, '6×7': { n: 3, ok: 3, r: 3 } } };
  const m = mergeStates(a, b);
  assert.deepEqual(Object.keys(m.facts).sort(), ['2×3', '4×5', '6×7']); assert.equal(m.facts['2×3'].n, 5);
  replaceState({ sk: {}, sessions: [] }); assert.deepEqual(S.facts, {});
  replaceState({ facts: [1, 2] }); assert.deepEqual(S.facts, {}, 'a corrupt facts value is reset');
});

test('factClass thresholds', () => {
  assert.equal(factClass(undefined), 'f0'); assert.equal(factClass({ n: 4, ok: 2, r: 2 }), 'fb');
  assert.equal(factClass({ n: 4, ok: 4, r: 6 }), 'fm'); assert.equal(factClass({ n: 4, ok: 4, r: 4 }), 'fg');
  assert.equal(factClass({ n: 20, ok: 20, r: 15 }), 'fa');
});

test("plan(): practise, review and daily tick off from real data; a zero-correct session does not count", () => {
  const now = Date.now();
  replaceState({ goal: 1, sessions: [{ t: now, dur: 120, n: 5, ok: 0, pts: 0, tm: 0, m: 'train' }] });
  let p = plan(now); assert.equal(p[0].done, false); assert.equal(p[1].done, true); assert.equal(p[2].done, false);
  replaceState({ goal: 1, sessions: [{ t: now, dur: 120, n: 30, ok: 25, pts: 300, tm: 2, m: 'train' }], daily: { [new Date(now).toISOString().slice(0, 10)]: 0 }, weak: { '1 + 1': { q: '1 + 1', a: 2, sk: 'add', box: 0, due: now - 1, at: now } } });
  p = plan(now); assert.equal(p[0].done, true); assert.equal(p[1].done, false); assert.match(p[1].detail, /1 due/);
});

test('wiring: crash recovery, par readout, rating movers, plan strip and table drill are in the screens', () => {
  assert.match(src('nav.js'), /function run\(name\)[\s\S]*catch \(err\)[\s\S]*This screen hit a problem/);
  assert.match(src('nav.js'), /run\(view\.scr\)/);
  assert.match(src('views/play.js'), /'par ' \+ T0\(p\)/);
  assert.match(src('views/results.js'), /class="movers"/);
  assert.match(src('views/home.js'), /class="plan"/);
  assert.match(src('views/progress.js'), /A\.tableDrill/);
  const css = fs.readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /^\.fg \{/m, 'the grid container must not share the .fg class with the "good" cell colour');
  assert.match(css, /^\.fgrid \{ display: grid;/m);
});
