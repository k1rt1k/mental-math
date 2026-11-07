// v14.73: Learn-path runs count for the streak and daily goal, due retention checks surface in the nav and the reminder, and mastering a path pays off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, S, replaceState } from '../public/js/state.js';
import { PathSession, logPathRun, dueChecks, pendingChecks, nextCheckAt, masteryInfo, progress, recordCheck, RET } from '../public/js/paths.js';
import { streak, todayCount, learnToday, week, isPace, masteredPaths, MS, ctx, modeLabel } from '../public/js/stats.js';
import { cleanRec, message, retDue } from '../netlify/lib/pushlogic.mjs';

const DAY = 864e5;
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
/** A practise run of `n` correct answers, each taking `sec` seconds on a fake clock. */
function run(skill, n, sec) {
  let t = 0;
  const s = new PathSession(skill, 0, 'practise', { now: () => t, rand: seeded(5) });
  s.begin();
  for (let i = 0; i < n; i++) { s.next(); t += sec * 1000; s.record(true); }
  return s;
}
const passAll = (k, now) => { for (let i = 0; i < 5; i++) recordCheck(k, i, i == 4 ? 'test' : 'check', { pass: true, n: 5, correct: 5 }, now); };

test('a path run is saved as a session that keeps the streak and leaves ratings alone', () => {
  replaceState(fresh());
  const before = JSON.stringify(S.sk);
  const s = run('mul', 8, 20), lg = logPathRun(s, true);
  assert.equal(lg.rec.m, 'path'); assert.equal(lg.rec.ok, 8); assert.equal(lg.rec.dur, 160); assert.equal(lg.rec.ps, 'mul');
  assert.equal(S.sessions.length, 1);
  assert.equal(streak(), 1, 'a Learn-only day starts a streak');
  assert.equal(JSON.stringify(S.sk), before, 'ratings never move');
  assert.equal(modeLabel('path'), 'Learn path');
});

test('Learn minutes add up toward the daily goal, 2 minutes per session', () => {
  replaceState(fresh());
  logPathRun(run('add', 8, 10), true);               // 80 s: not a goal session yet
  assert.equal(todayCount(), 0); assert.equal(learnToday().secs, 80); assert.equal(learnToday().toNext, 40);
  logPathRun(run('add', 8, 10), true);               // 160 s total: one session
  assert.equal(todayCount(), 1);
  for (let i = 0; i < 6; i++) logPathRun(run('add', 8, 10), true);   // 15+ minutes of Learn
  assert.equal(todayCount(), 5, '8 runs of 80 s is 640 s: five goal sessions');
});

test('tiny or empty runs do not count, a forgotten tab cannot buy minutes, and path stays out of pace stats', () => {
  replaceState(fresh());
  const none = run('mul', 3, 5); none.ok = 0;
  assert.equal(logPathRun(none, true), null, 'nothing right: not a session');
  assert.equal(logPathRun(run('mul', 3, 5), false), null, 'a run left after 3 answers is too small');
  assert.ok(logPathRun(run('mul', 5, 5), false), 'five answers is enough when leaving early');
  const idle = logPathRun(run('mul', 8, 3000), true);
  assert.ok(idle.rec.dur <= 90 * 8, 'duration is capped per answer');
  assert.equal(isPace(idle.rec), false);
  assert.equal(week(-1, 7).pace, 0, 'path points never enter the weekly pace');
  assert.equal(week(-1, 7).s, 2, 'but the sessions still count');
});

test('retention checks that are ready show up, and pending ones carry their open time', () => {
  replaceState(fresh());
  const t0 = Date.now() - 2 * DAY;
  passAll('mul', t0);
  assert.equal(dueChecks().length, 1); assert.equal(dueChecks()[0].k, 'mul'); assert.equal(dueChecks()[0].i, 0);
  const pend = pendingChecks();
  assert.equal(pend.length, 1); assert.equal(pend[0].n, 'Multiplication'); assert.equal(pend[0].l, RET[0].label);
  recordCheck('mul', 4, 'retain', { pass: true, ret: 0 }, Date.now());
  assert.equal(dueChecks().length, 0, 'the one-week check is still waiting');
  const nx = nextCheckAt(); assert.ok(nx > Date.now() + 6 * DAY - 1000);
});

test('the reminder leads with a due check and ignores one that has not opened', () => {
  const now = Date.now(), rec = cleanRec({ ret: [{ at: now - 1000, n: 'Multiplication', l: 'Next-day check' }, { at: now + DAY, n: 'Squares<script>', l: 'One-week check' }, { at: 'x' }], due: 7, streak: 5 });
  assert.equal(rec.ret.length, 2); assert.equal(rec.ret[1].n, 'Squaresscript');
  assert.equal(retDue(rec, now).length, 1);
  const m = message('daily', rec, now);
  assert.match(m.title, /Multiplication next-day check is ready/); assert.match(m.body, /7 review questions/); assert.equal(m.url, '/?go=retain');
  assert.match(message('streak', rec, now).body, /counts for the streak/);
  const quiet = message('daily', { ...rec, ret: [] }, now);
  assert.doesNotMatch(quiet.url, /retain/);
  assert.deepEqual(cleanRec({}).ret, []);
});

test('mastering a path unlocks a milestone and has a story to tell', () => {
  replaceState(fresh());
  const t0 = Date.now() - 9 * DAY;
  passAll('sq', t0); recordCheck('sq', 4, 'retain', { pass: true, ret: 0 }, t0 + DAY); recordCheck('sq', 4, 'retain', { pass: true, ret: 1 }, t0 + 8 * DAY);
  assert.ok(progress('sq').mastered); assert.deepEqual(masteredPaths(), ['sq']);
  const m = masteryInfo('sq'); assert.equal(m.count, 1); assert.equal(m.test, 100); assert.ok(m.days >= 8 && m.days <= 10);
  assert.ok(MS.find((x) => x[0] == 'pm1')[2](ctx()));
  assert.ok(!MS.find((x) => x[0] == 'pm5')[2](ctx()));
});
