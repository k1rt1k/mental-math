// Review covers the due notebook items when any are due, otherwise everything saved. The Notebook button, the badge text and the session all use one answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, replaceState, fresh, reviewPlan } from '../public/js/state.js';
import { Session } from '../public/js/session.js';

const item = (q, due) => ({ q, a: 1, sk: 'add', d: 3, pt: 'no carry', tip: '', box: 0, due, at: 1 });
const load = (items) => { replaceState(fresh()); items.forEach((w) => (S.weak[w.q] = w)); };
const NOW = 1e12, PAST = NOW - 1000, FUTURE = NOW + 60 * 60 * 1000;

test('reviewPlan: due items when some are due', () => {
  load([item('1 + 1', PAST), item('2 + 2', PAST), item('3 + 3', FUTURE), item('4 + 4', FUTURE)]);
  const p = reviewPlan(NOW);
  assert.deepEqual([p.saved, p.due, p.count, p.dueOnly], [4, 2, 2, true]);
});

test('reviewPlan: falls back to everything saved when none are due', () => {
  load([item('1 + 1', FUTURE), item('2 + 2', FUTURE), item('3 + 3', FUTURE)]);
  const p = reviewPlan(NOW);
  assert.deepEqual([p.saved, p.due, p.count, p.dueOnly], [3, 0, 3, false]);
});

test('reviewPlan: capped at 20 and empty is zero', () => {
  load(Array.from({ length: 30 }, (_, i) => item('1 + ' + i, PAST)));
  assert.equal(reviewPlan(NOW).count, 20);
  load([]);
  assert.deepEqual([reviewPlan(NOW).count, reviewPlan(NOW).dueOnly], [0, false]);
});

test('a review session with due items stops after them and does not pull in items that are not due', () => {
  const real = Date.now, t0 = real();
  Date.now = () => t0;
  try {
    load([item('1 + 1', t0 - 1000), item('2 + 2', t0 - 1000), item('3 + 3', t0 + 3.6e6), item('4 + 4', t0 + 3.6e6)]);
    const s = new Session('review', { now: () => 0 });
    assert.equal(s.total, 2);
    s.begin();
    const seen = [];
    for (let n = 0; n < 10 && s.next(); n++) { seen.push(s.cur.wk || s.cur.q); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') s.answer(true); }
    assert.deepEqual(seen.sort(), ['1 + 1', '2 + 2']);
  } finally { Date.now = real; }
});

test('a review session with nothing due covers everything saved', () => {
  const real = Date.now, t0 = real();
  Date.now = () => t0;
  try {
    load([item('1 + 1', t0 + 3.6e6), item('2 + 2', t0 + 3.6e6), item('3 + 3', t0 + 3.6e6)]);
    const s = new Session('review', { now: () => 0 });
    assert.equal(s.total, 3);
    s.begin();
    const seen = [];
    for (let n = 0; n < 10 && s.next(); n++) { seen.push(s.cur.wk || s.cur.q); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') s.answer(true); }
    assert.equal(seen.length, 3);
  } finally { Date.now = real; }
});
