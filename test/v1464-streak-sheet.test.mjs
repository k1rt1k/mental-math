import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fresh, S, replaceState } from '../public/js/state.js';
import { streak, longest, streakDays, streakRuns, restUsed, STREAK_MARKS } from '../public/js/stats.js';
import { ymd, dayAgo } from '../public/js/util.js';
const DAY = 864e5;
const play = (...ago) => ago.forEach((a) => S.sessions.push({ t: Date.now() - a * DAY, m: 'train', dur: 60, n: 10, ok: 8, ft: 8, pts: 100, lv: {} }));
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const src = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('calendar: whole Monday-first weeks, one today cell, nothing before the first day', () => {
  replaceState(fresh()); play(0, 1);
  const c = streakDays(5);
  assert.equal(c.length, 35);
  assert.equal(new Date(c[0].t).getDay(), 1, 'starts on a Monday');
  assert.equal(c.filter((x) => x.today).length, 1);
  assert.ok(c.filter((x) => x.future).every((x) => x.k > ymd()), 'only days after today are future');
  assert.equal(c.filter((x) => x.on).length, 2);
});

test('a forgiven rest day is marked, counted once, and the streak runs across it', () => {
  replaceState(fresh()); play(...seq(4, 9), 2, 1, 0);          // 9 in a row, one missed day (3 days ago), then 3 more
  assert.equal(streak(), 12);
  assert.equal(restUsed(), 1);
  const rest = streakDays(5).filter((x) => x.rest);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].k, ymd(dayAgo(3)));
});

test('a plain gap is not a rest day', () => {
  replaceState(fresh()); play(0, 1, 4, 5);
  assert.equal(restUsed(), 0);
  assert.equal(streakDays(5).filter((x) => x.rest).length, 0);
});

test('streak history lists each run, oldest first, and marks the current one', () => {
  replaceState(fresh()); play(20, 19, ...seq(4, 9), 2, 1, 0);
  const r = streakRuns();
  assert.deepEqual(r.map((x) => x.len), [2, 12]);
  assert.deepEqual(r.map((x) => x.cur), [false, true]);
  assert.equal(longest(), 12);
});

test('a lapsed streak leaves the history with no current run', () => {
  replaceState(fresh()); play(10, 9, 8);
  assert.equal(streak(), 0);
  assert.deepEqual(streakRuns().map((x) => [x.len, x.cur]), [[3, false]]);
});

test('answers per day feed the heat levels', () => {
  replaceState(fresh()); play(0, 0, 1);
  const c = streakDays(2), today = c.find((x) => x.today), yest = c.find((x) => x.k == ymd(dayAgo(1)));
  assert.equal(today.n, 20); assert.equal(yest.n, 10);
});

test('the streak sheet opens from the Home pill, the rest-day chip and the rail', () => {
  assert.match(src('js/views/home.js'), /class="pill streak[^"]*"[^>]*data-act="streakCard"/);
  assert.match(src('js/views/home.js'), /class="chipbtn" data-act="streakCard"/);
  assert.match(src('js/main.js'), /class="rfb" data-act="streakCard"/);
  assert.match(src('js/views/streak.js'), /A\.streakCard = /);
  assert.match(src('js/views/home.js'), /import '\.\/streak\.js'/);
});

test('milestones come from one list that Home and the sheet share', () => {
  assert.deepEqual(STREAK_MARKS, [3, 7, 14, 30, 60, 100, 200, 365]);
  assert.match(src('js/views/home.js'), /MIL = STREAK_MARKS/);
  assert.match(src('js/views/streak.js'), /STREAK_MARKS/);
});
