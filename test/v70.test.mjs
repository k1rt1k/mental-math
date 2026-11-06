// 7.0: mistake analysis, weak-fact practice, trick of the day, suggestions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { errKind, how } from '../public/js/engine.js';
import { S, replaceState, mergeStates } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { weakFacts, trickOfDay, ERRL } from '../public/js/stats.js';
import { TRICKS } from '../public/js/tricks.js';
import { seeded } from '../public/js/util.js';

const src = (f) => fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');

test('errKind classifies slips', () => {
  assert.equal(errKind(56, 56), '');
  assert.equal(errKind(12, 21), 'swap'); assert.equal(errKind(396, 369), 'swap');
  assert.equal(errKind(56, 57), 'off1'); assert.equal(errKind(100, 99), 'off1');
  assert.equal(errKind(85, 75), 'place'); assert.equal(errKind(1225, 1325), 'place'); assert.equal(errKind(500, 400), 'place');
  assert.equal(errKind(48, 43), 'digit'); assert.equal(errKind(7, 3), 'digit');
  assert.equal(errKind(48, 91), 'other'); assert.equal(errKind(1234, 4321), 'swap');
  for (const k of ['swap', 'off1', 'place', 'digit', 'other', 'skip']) assert.ok(ERRL[k] && ERRL[k][0] && ERRL[k][1]);
});

test('a session records each slip kind, skips, and what you typed; lifetime counters grow', () => {
  replaceState({});
  const s = new Session(undefined, { rand: seeded(2) }); s.begin();
  s.next(); s.cur = { q: '7 × 8', a: 56, sk: 'mul', d: 3 }; s.qs = s.now();
  s.type('5'); assert.equal(s.type('7'), 'bad');          // 57: off by one
  assert.equal(s.cur.lastWrong, '57');
  s.back(); for (const c of '56') s.type(c); s.answer(true);
  s.next(); s.cur = { q: '9 × 9', a: 81, sk: 'mul', d: 3 }; s.answer(false);   // skip
  assert.deepEqual(s.errs, ['off1']); assert.equal(s.skips, 1);
  assert.equal(S.errs.off1, 1); assert.equal(S.errs.skip, 1);
  assert.equal(s.log[0].ty, '57'); assert.equal(s.log[0].ok, true);
});

test('wrong, then skipped is one slip, not also a skip', () => {
  replaceState({});
  const s = new Session(undefined, { rand: seeded(2) }); s.begin();
  s.next(); s.cur = { q: '7 × 8', a: 56, sk: 'mul', d: 3 }; s.qs = s.now();
  s.type('5'); s.type('7'); s.answer(false);
  assert.equal(s.skips, 0); assert.equal(S.errs.skip || 0, 0);
});

test('errs merge: lifetime counters take the larger value per kind; bad values are dropped', () => {
  const m = mergeStates({ sk: {}, sessions: [], errs: { off1: 4, swap: 1 } }, { sk: {}, sessions: [], errs: { off1: 2, place: 3, bad: 'x' } });
  assert.deepEqual(m.errs, { off1: 4, swap: 1, place: 3 });
  replaceState({ errs: [1] }); assert.deepEqual(S.errs, {});
});

const withFacts = () => replaceState({ facts: { '6×7': { n: 6, ok: 3, r: 4 }, '7×8': { n: 5, ok: 5, r: 8 }, '2×3': { n: 9, ok: 9, r: 5 }, '9×9': { n: 1, ok: 0, r: 0 } } });

test('weakFacts: only seen-twice facts that are missed or slow, worst first', () => {
  withFacts();
  assert.deepEqual(weakFacts(), [[6, 7], [7, 8]]);
  replaceState({}); assert.deepEqual(weakFacts(), []);
});

test('weak-fact drill: only weak facts, always correct answers, fixed difficulty, never moves a rating', () => {
  withFacts(); const before = JSON.stringify(Object.fromEntries(Object.entries(S.sk).map(([k, v]) => [k, v.lv])));
  const s = new Session(undefined, { rand: seeded(9), cfg: { wf: 1, dur: 60, only: 'all', off: 0 } }); s.begin();
  assert.ok(s.wf && s.frozen && s.mk.endsWith('wf'));
  for (let i = 0; i < 80; i++) {
    assert.ok(s.next()); const p = s.cur;
    assert.equal(p.pt, 'weak fact'); const nums = p.q.match(/\d+/g).map(Number);
    const ok = p.q.includes('×') ? nums[0] * nums[1] == p.a : nums[0] / nums[1] == p.a;
    assert.ok(ok, p.q);
    assert.ok(['6×7', '7×8'].includes(p.tip.match(/(\d+ × \d+)/)[1].replace(/ /g, '')), p.tip);
    s.answer(true);
  }
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(S.sk).map(([k, v]) => [k, v.lv]))), before);
  assert.ok(how(s.cur) !== undefined);
});

test('weak-fact mode with no weak facts falls back to a normal session', () => {
  replaceState({});
  const s = new Session(undefined, { rand: seeded(4), cfg: { wf: 1, dur: 60 } }); s.begin();
  assert.equal(s.wf, false); assert.ok(s.next());
});

test('mixed-in weak facts in normal practice are flagged non-rating', () => {
  withFacts();
  const s = new Session(undefined, { rand: seeded(11), cfg: { only: 'mul', dur: 120 } }); s.begin();
  let seen = 0;
  for (let i = 0; i < 300; i++) { S.facts = { '6×7': { n: 6, ok: 3, r: 4 }, '7×8': { n: 5, ok: 5, r: 8 } }; s.next();   // facts stay weak, so this measures the mixing rate itself
    if (s.cur.pt == 'weak fact') { seen++; assert.equal(s.cur.nr, 1); } s.answer(true); }
  assert.ok(seen > 10 && seen < 120, 'weak facts appear now and then (' + seen + ' of 300)');
});

test('trickOfDay is stable within a day, changes over days, and is always a real trick', () => {
  replaceState({});
  const now = Date.UTC(2026, 10, 3, 12), a = trickOfDay(now);
  assert.equal(trickOfDay(now + 3600e3).id, a.id);
  const ids = new Set([...Array(30)].map((_, i) => trickOfDay(now + i * 864e5).id));
  assert.ok(ids.size >= 5); for (const id of ids) assert.ok(TRICKS.some((t) => t.id == id));
});

test('wiring: why-you-missed, mistake patterns, weak-fact button, trick card, suggestions', () => {
  assert.match(src('views/results.js'), /Why you missed/); assert.match(src('views/results.js'), /you typed/);
  assert.match(src('views/progress.js'), /Mistake patterns/); assert.match(src('views/progress.js'), /A\.weakFacts/);
  assert.match(src('views/home.js'), /Trick of the day/); assert.match(src('views/learn.js'), /Suggested for you/);
});
