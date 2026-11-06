// 5.6: coach with zero correct answers; results de-duplication; live mismatch colouring is source-wired.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { replaceState } from '../public/js/state.js';
import { coach } from '../public/js/stats.js';

test('coach does not call a zero-correct session "only 0% right, slow down"', () => {
  replaceState({});
  const msg = coach({ ok: 0, n: 6, ft: 0, by: { mod: [3, 0, 0] }, kind: 'train' });
  assert.match(msg, /Nothing was answered correctly/);
});

test('coach is unchanged for a normal session', () => {
  replaceState({});
  assert.doesNotMatch(coach({ ok: 30, n: 30, ft: 30, by: { add: [30, 30, 60] }, kind: 'train' }), /Nothing was answered/);
});

test('results: a question missed twice is listed once, and an empty ghost chart is not drawn', () => {
  const src = fs.readFileSync(new URL('../public/js/views/results.js', import.meta.url), 'utf8');
  assert.match(src, /findIndex\(\(y\) => !y\.ok && y\.q == x\.q\)/);
  assert.match(src, /e\.g\.length && e\.kind != .sprint. \? `<h2>Race against your ghost/);
  const log = [{ q: 'a', ok: false }, { q: 'b', ok: true }, { q: 'a', ok: false }, { q: 'c', ok: false }];
  const misses = log.filter((x, i, a) => !x.ok && a.findIndex((y) => !y.ok && y.q == x.q) == i);
  assert.deepEqual(misses.map((m) => m.q), ['a', 'c']);
});

test('play: the buffer turns red on a wrong prefix but scoring still waits for full length', async () => {
  const play = fs.readFileSync(new URL('../public/js/views/play.js', import.meta.url), 'utf8');
  assert.match(play, /startsWith\(sess\.buf\)/);
  const { Session } = await import('../public/js/session.js');
  replaceState({});
  const s = new Session(); s.cur = { q: '12 × 12', a: 144, sk: 'mul', d: 3 };
  assert.equal(s.type('2'), 'more');       // wrong prefix: not counted yet
  assert.equal(s.slips, 0);
  s.back(); assert.equal(s.buf, '');
});

import { Session } from '../public/js/session.js';
import { S } from '../public/js/state.js';
import { days, streak } from '../public/js/stats.js';

test('a run of skips (nothing correct) is not saved and gives no streak credit', () => {
  replaceState({});
  const s = new Session(undefined, { rand: () => 0.3 }); s.begin();
  for (let i = 0; i < 6; i++) { s.next(); s.answer(false); }
  assert.equal(s.finish(), null); assert.equal(S.sessions.length, 0); assert.equal(streak(), 0);
});

test('days() ignores old zero-correct sessions already in saved data', () => {
  replaceState({ sessions: [{ t: Date.now(), dur: 120, n: 6, ok: 0, pts: 0, tm: 0, m: 'train' }] });
  assert.equal(days().size, 0); assert.equal(streak(), 0);
  replaceState({ sessions: [{ t: Date.now(), dur: 120, n: 6, ok: 4, pts: 50, tm: 2, m: 'train' }] });
  assert.equal(days().size, 1); assert.equal(streak(), 1);
});

test('paused: Esc resumes, End session needs a click; results offer Share', () => {
  const play = fs.readFileSync(new URL('../public/js/views/play.js', import.meta.url), 'utf8');
  assert.match(play, /k == 'Escape'\) resume\(\)/);
  assert.doesNotMatch(play, /endNow">End session<kbd>/);
  const res = fs.readFileSync(new URL('../public/js/views/results.js', import.meta.url), 'utf8');
  assert.match(res, /navigator\.share/);
});
