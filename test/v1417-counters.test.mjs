// 14.17: learning counters (pat / facts / errs) merge as per-device contributions, not "larger wins".
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, replaceState, fresh, migrate, mergeStates, bump, setDeviceId, finishCal } from '../public/js/state.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const P = 'Multiplication · 2×1 digits';
/** A shared starting point: both devices have the same 5 observations (4 correct). */
const legacy = (o) => { const x = { ...fresh(), ...o }; delete x.ctr; return x; };   // the shape saved before 14.17: flat totals, no per-device counters
const shared = () => legacy({ u: 1, pat: { [P]: { n: 5, ok: 4, r: 4 } }, facts: { '6×7': { n: 5, ok: 4, r: 4 } }, errs: { off1: 5 } });
/** Run `fn` as another device on top of `start`, return the resulting state (like a device saving to its storage). */
function device(id, start, fn) { setDeviceId(id); replaceState(clone(start)); fn(); return clone(S); }
const obs = (n, ok = n) => { for (let i = 0; i < n; i++) { const g = i < ok; bump('pat', P, 1, g ? 1 : 0, g ? 1 : 0); bump('facts', '6×7', 1, g ? 1 : 0, g ? 1 : 0); bump('errs', 'off1'); } };

test('the reported case: both start at 5, laptop +3, phone +2 → 10, in either merge order', () => {
  const base = migrate(shared());
  const laptop = device('laptop', base, () => obs(3)), phone = device('phone', base, () => obs(2));
  assert.equal(laptop.pat[P].n, 8); assert.equal(phone.pat[P].n, 7);
  for (const m of [mergeStates(laptop, phone), mergeStates(phone, laptop)]) {
    assert.equal(m.pat[P].n, 10); assert.equal(m.facts['6×7'].n, 10); assert.equal(m.errs.off1, 10);
    assert.equal(m.pat[P].ok, 9);   // 4 shared + 3 + 2
  }
});

test('merging is idempotent: syncing the same data again, or through the cloud, never inflates counts', () => {
  const base = migrate(shared());
  const laptop = device('laptop', base, () => obs(3)), phone = device('phone', base, () => obs(2));
  const cloud = mergeStates(laptop, phone);
  assert.equal(mergeStates(cloud, cloud).pat[P].n, 10);
  assert.equal(mergeStates(laptop, cloud).pat[P].n, 10);
  assert.equal(mergeStates(mergeStates(phone, cloud), laptop).pat[P].n, 10);
  assert.deepEqual(mergeStates(cloud, laptop).ctr, mergeStates(laptop, cloud).ctr, 'commutative');
});

test('work continues after a sync: each device keeps adding only its own observations', () => {
  const base = migrate(shared());
  const laptop = device('laptop', base, () => obs(3)), phone = device('phone', base, () => obs(2));
  const cloud = mergeStates(laptop, phone);
  const laptop2 = device('laptop', cloud, () => obs(4));          // laptop synced, then practised 4 more
  const phone2 = device('phone', cloud, () => obs(1));            // phone synced, then practised 1 more
  assert.equal(mergeStates(laptop2, phone2).pat[P].n, 10 + 4 + 1);
  assert.equal(mergeStates(mergeStates(laptop2, cloud), phone2).pat[P].n, 15, 'a stale copy in the mix changes nothing');
});

test('three devices', () => {
  const base = migrate(shared());
  const [a, b, c] = ['a', 'b', 'c'].map((id, i) => device(id, base, () => obs(i + 1)));
  assert.equal(mergeStates(mergeStates(a, b), c).pat[P].n, 5 + 1 + 2 + 3);
  assert.equal(mergeStates(a, mergeStates(c, b)).pat[P].n, 11);
});

test('different keys on different devices are all kept', () => {
  const l = device('laptop', fresh(), () => bump('pat', 'Squares · general', 1, 1, 1));
  const p = device('phone', fresh(), () => { bump('pat', 'Addition · carry', 2, 1, 1); bump('errs', 'swap'); });
  const m = mergeStates(l, p);
  assert.equal(m.pat['Squares · general'].n, 1); assert.equal(m.pat['Addition · carry'].n, 2); assert.equal(m.errs.swap, 1);
});

test('totals read by the screens stay in step with every recorded observation', () => {
  replaceState(fresh()); setDeviceId('laptop');
  bump('pat', P, 1, 1, 0.8); bump('pat', P, 1, 0, 0); bump('facts', '2×3', 1, 1, 1.2); bump('errs', 'skip');
  assert.deepEqual(S.pat[P], { n: 2, ok: 1, r: 0.8 });
  assert.deepEqual(migrate(clone(S)).pat, S.pat, 'saving and reloading gives the same totals');
  assert.equal(S.facts['2×3'].n, 1); assert.equal(S.errs.skip, 1);
});

test('data from before this model becomes the shared base; two such copies merge by the old rule once, then add up', () => {
  const a = migrate(shared()), b = migrate(legacy({ ...shared(), pat: { [P]: { n: 7, ok: 6, r: 6 } } }));
  assert.equal(mergeStates(a, b).pat[P].n, 7, 'pre-upgrade history cannot be split, so the larger base wins (one time)');
  const m = mergeStates(device('laptop', a, () => obs(2)), device('phone', b, () => obs(3)));
  assert.equal(m.pat[P].n, 7 + 2 + 3);
});

test('a device that has not upgraded yet (flat totals, practised separately) still lands on the right total', () => {
  const up = device('laptop', migrate(shared()), () => obs(3));                // upgraded laptop: 5 shared + 3
  const old = legacy({ ...shared(), pat: { [P]: { n: 7, ok: 6, r: 6 } } });     // old phone: 5 shared + 2 of its own, never saw the laptop
  assert.equal(mergeStates(up, old).pat[P].n, 10);
  assert.equal(mergeStates(old, up).pat[P].n, 10);
});

test('corrupt counters are dropped, valid ones kept, and nothing is shared with the input object', () => {
  const raw = { sk: {}, sessions: [], pat: { good: { n: 3, ok: 2, r: 1 }, bad: { n: 'x' }, worse: 5, over: { n: 2, ok: 9, r: -4 } }, errs: { off1: 2, bad: 'x', neg: -1 } };
  const s = migrate(raw);
  assert.deepEqual(Object.keys(s.pat).sort(), ['good', 'over']); assert.deepEqual(s.pat.over, { n: 2, ok: 2, r: 0 });
  assert.deepEqual(s.errs, { off1: 2 });
  s.pat.good.n = 99; assert.equal(raw.pat.good.n, 3);
});

test('recalibration: a copy that predates it cannot bring back the old speed totals', () => {
  const base = migrate(legacy({ ...shared(), cal: 0, sessions: [{ t: 1, dur: 60, n: 1, ok: 1 }], pat: { [P]: { n: 5, ok: 4, r: 11 } } }));
  const old = clone(base);
  replaceState(clone(base)); finishCal(); const fixed = clone(S);
  assert.equal(fixed.pat[P].r, 4);
  const m = mergeStates(fixed, old);
  assert.equal(m.pat[P].r, 4); assert.equal(m.pat[P].n, 5);
});

test('facts keep their 80-key cap', () => {
  replaceState(fresh()); setDeviceId('laptop');
  for (let i = 0; i < 90; i++) bump('facts', 'f' + i, 1, 1, 1);
  assert.equal(Object.keys(S.facts).length, 80);
  bump('facts', 'f0', 1, 1, 1); assert.equal(S.facts.f0.n, 2, 'an existing fact still counts at the cap');
});
