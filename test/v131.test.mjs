// 13.1: the rest-day rule. One rest day is forgiven only after 7 consecutive practised days.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/London';
const store = {};
globalThis.localStorage = new Proxy(store, { get: (t, k) => (k == 'removeItem' ? (x) => delete t[x] : t[k]), set: (t, k, v) => ((t[k] = String(v)), true) });
globalThis.addEventListener = () => {}; globalThis.document = { addEventListener() {}, hidden: false };

const { S, replaceState, fresh } = await import('../public/js/state.js');
const { streak, longest } = await import('../public/js/stats.js');

const sess = (t) => ({ t, m: 'train', dur: 120, n: 20, ok: 18, pts: 300, tm: 2 });
const at = (day, h = 20) => new Date(2026, 0, day, h).getTime();      // January 2026, day-of-month (may exceed 31: rolls into February)
const withNow = (t, f) => { const r = Date.now; Date.now = () => t; try { return f(); } finally { Date.now = r; } };
// practised: day-of-month numbers; now: day-of-month it is "today"
const run = (practised, now) => {
  replaceState(fresh());
  S.sessions = practised.map((d) => sess(at(d, 12)));
  return withNow(at(now), () => ({ cur: streak(), best: longest() }));
};
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + i);

test('reported cases: a missed day is not forgiven without 7 consecutive days', () => {
  assert.deepEqual(run([1, 3], 3), { cur: 1, best: 1 });
  assert.deepEqual(run([1, 2, 3, 5], 5), { cur: 1, best: 3 });
});

test('1 to 6 consecutive days then a rest day: the streak restarts at 1', () => {
  for (let n = 1; n <= 6; n++) {
    const r = run([...seq(1, n), n + 2], n + 2);
    assert.deepEqual(r, { cur: 1, best: n }, `${n} days, rest, 1 day`);
    const r2 = run([...seq(1, n), n + 2, n + 3], n + 3);
    assert.deepEqual(r2, { cur: 2, best: Math.max(n, 2) }, `${n} days, rest, 2 days`);
  }
});

test('exactly 7 consecutive days then a rest day: the rest day is forgiven', () => {
  assert.deepEqual(run([...seq(1, 7), 9], 9), { cur: 8, best: 8 });
  assert.deepEqual(run([...seq(1, 7), 9, 10, 11], 11), { cur: 10, best: 10 });
  assert.deepEqual(run([...seq(1, 8), 10], 10), { cur: 9, best: 9 }, 'a longer run earns it too');
});

test('two rest days in a row are never forgiven, even after 7 days', () => {
  assert.deepEqual(run([...seq(1, 7), 10], 10), { cur: 1, best: 7 });
  assert.deepEqual(run([...seq(1, 30), 33], 33), { cur: 1, best: 30 });
});

test('multiple forgiven rest days need 7 more practised days between each', () => {
  // 7, rest, 7, rest, 3  -> 17
  const full = [...seq(1, 7), ...seq(9, 7), ...seq(17, 3)];
  assert.deepEqual(run(full, 19), { cur: 17, best: 17 });
  // 7, rest, 6, rest, 2: the second rest day was not earned (only 6 since the first)
  const short = [...seq(1, 7), ...seq(9, 6), ...seq(17, 2)];
  assert.deepEqual(run(short, 18), { cur: 2, best: 13 });
  // 7, rest, 7, rest, 7, rest, 1 -> 22
  const three = [...seq(1, 7), ...seq(9, 7), ...seq(17, 7), 25];
  assert.deepEqual(run(three, 25), { cur: 22, best: 22 });
});

test('not having practised yet today keeps the streak (one-day grace), two missed days do not', () => {
  assert.equal(run(seq(1, 3), 3).cur, 3, 'practised today');
  assert.equal(run(seq(1, 3), 4).cur, 3, 'not yet today');
  assert.equal(run(seq(1, 3), 5).cur, 0, 'yesterday and today both missed, run was under 7');
  assert.equal(run(seq(1, 7), 8).cur, 7);
  assert.equal(run(seq(1, 7), 9).cur, 7, 'earned rest day yesterday, today still to play');
  assert.equal(run(seq(1, 7), 10).cur, 0, 'two missed days after 7');
  assert.equal(run([...seq(1, 7), 9], 10).cur, 8, 'grace after a forgiven day');
  assert.equal(run([], 5).cur, 0);
});

test('current streak is never longer than the longest streak, and the longest is the max over runs', () => {
  const day = (n) => n;
  // independent model on integer day numbers
  const model = (set, today) => {
    const days = [...set].sort((a, b) => a - b); const c = {}; let cur = 0, since = 0, prev = null, best = 0;
    for (const d of days) {
      if (prev !== null && d == prev + 1) { cur++; since++; }
      else if (prev !== null && d == prev + 2 && since >= 7) { cur++; since = 1; }
      else { cur = 1; since = 1; }
      c[d] = { cur, since }; best = Math.max(best, cur); prev = d;
    }
    let now = 0;
    if (c[today]) now = c[today].cur; else if (c[today - 1]) now = c[today - 1].cur; else if (c[today - 2] && c[today - 2].since >= 7) now = c[today - 2].cur;
    return { cur: now, best };
  };
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let k = 0; k < 150; k++) {
    const p = 0.4 + rnd() * 0.55, set = new Set();
    for (let d = 1; d <= 60; d++) if (rnd() < p) set.add(day(d));
    const today = 55 + Math.floor(rnd() * 6);
    const past = [...set].filter((d) => d <= today);   // nothing is practised in the future
    const got = run(past, today), want = model(past, today);
    assert.deepEqual(got, want, `${[...set].join()} @${today}`);
    assert.ok(got.cur <= got.best);
  }
});

test('a streak that ends on the day before the clock change is counted across it', () => {
  // 7 days around the UK spring clock change (29 Mar 2026), then a forgiven rest day
  replaceState(fresh());
  const d = (m, n, h = 12) => new Date(2026, m, n, h).getTime();
  S.sessions = [24, 25, 26, 27, 28, 29, 30].map((n) => sess(d(2, n))).concat([sess(d(3, 1))]);
  const r = withNow(d(3, 1, 20), () => ({ cur: streak(), best: longest() }));
  assert.deepEqual(r, { cur: 8, best: 8 });
});
