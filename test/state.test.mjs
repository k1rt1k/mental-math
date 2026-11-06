import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, mergeStates, fresh } from '../public/js/state.js';
import { IDS } from '../public/js/engine.js';

const mk = (over = {}) => ({ ...fresh(), ...over });
const sess = (t, extra = {}) => ({ t, m: 'train', dur: 120, n: 20, ok: 18, pts: 300, tm: 2, by: {}, lv: {}, ...extra });

test('migrate never throws and always yields a complete state', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { sk: 5 }, { sessions: 'no' }, { sk: { add: { lv: 'abc' } }, weak: [] }]) {
    const s = migrate(bad);
    IDS.forEach((k) => { assert.ok(s.sk[k].lv >= 1 && s.sk[k].lv <= 12); assert.ok(Number.isFinite(s.sk[k].acc)); });
    assert.ok(Array.isArray(s.sessions)); assert.equal(typeof s.weak, 'object'); assert.ok(!Array.isArray(s.weak));
  }
});

test('migrate adds skills missing from an older backup (e.g. Roots & cubes) at their starting rating', () => {
  const old = fresh(); delete old.sk.pw;
  assert.equal(migrate(old).sk.pw.lv, 4);
});

test('migrate drops corrupt sessions but keeps good ones', () => {
  const s = migrate({ sessions: [sess(1), null, { t: 'x' }, sess(2), { t: 3, dur: 0, n: 1 }] });
  assert.deepEqual(s.sessions.map((x) => x.t), [1, 2]);
});

test('merge unions sessions and never loses any', () => {
  const a = mk({ u: 5, sessions: [sess(1), sess(2)] }), b = mk({ u: 9, sessions: [sess(2), sess(3)] });
  const m = mergeStates(a, b);
  assert.deepEqual(m.sessions.map((x) => x.t), [1, 2, 3]);
  assert.deepEqual(mergeStates(b, a).sessions.map((x) => x.t), [1, 2, 3]);
});

test('merge keeps the rating from whichever device practised a skill more', () => {
  const a = mk({ u: 9 }), b = mk({ u: 5 });
  a.sk.mul = { lv: 6, acc: .9, spd: 1, n: 50 }; a.sk.add = { lv: 4.5, acc: .9, spd: 1, n: 10 };
  b.sk.mul = { lv: 5, acc: .9, spd: 1, n: 20 }; b.sk.add = { lv: 5.5, acc: .9, spd: 1, n: 40 };
  const m = mergeStates(a, b);
  assert.equal(m.sk.mul.lv, 6); assert.equal(m.sk.add.lv, 5.5);
});

test('merge combines missed questions, bests, daily scores, milestones', () => {
  const a = mk({ u: 1, weak: { '1 + 1': { q: '1 + 1', a: 2, sk: 'add', at: 1 } }, best: { train: { pts: 100 } }, daily: { d1: 50 }, ms: ['s3'] });
  const b = mk({ u: 2, weak: { '2 + 2': { q: '2 + 2', a: 4, sk: 'add', at: 2 } }, best: { train: { pts: 150 } }, daily: { d1: 40, d2: 10 }, ms: ['a1'] });
  const m = mergeStates(a, b);
  assert.deepEqual(Object.keys(m.weak).sort(), ['1 + 1', '2 + 2']);
  assert.equal(m.best.train.pts, 150); assert.equal(m.daily.d1, 50); assert.equal(m.daily.d2, 10);
  assert.deepEqual(m.ms.sort(), ['a1', 's3']);
});

test('merge keeps this device’s appearance settings', () => {
  const a = mk({ u: 1, theme: 'light', acc: 'rose' }), b = mk({ u: 9, theme: 'dark', acc: 'teal' });
  const m = mergeStates(a, b);
  assert.equal(m.theme, 'light'); assert.equal(m.acc, 'rose');
});

import { recommend } from '../public/js/stats.js';
import { replaceState, S } from '../public/js/state.js';
import { ymd } from '../public/js/util.js';

test('recommend: first run, due reviews, goal, daily, survival in that order', () => {
  replaceState(fresh());
  assert.equal(recommend().kind, 'first');
  const now = Date.now(), ses = (t) => sess(t);
  replaceState({ ...fresh(), sessions: [ses(now - 1000)] });
  const weak = {}; for (let i = 0; i < 5; i++) weak['q' + i] = { q: 'q' + i, sk: 'add', box: 0, due: 0, at: 1 };
  Object.assign(S, { weak });
  assert.equal(recommend().kind, 'review');
  Object.assign(S, { weak: {} });
  assert.equal(recommend().kind, 'train');            // 1 of 2 sessions today
  S.sessions.push(ses(now - 500));
  assert.equal(recommend().kind, 'daily');            // goal met, daily not played
  S.daily[ymd()] = 80;
  assert.equal(recommend().kind, 'survival');
  S.goal = 3; assert.equal(recommend().kind, 'train');
});

import { compact, KEEP_BY, KEEP_LV } from '../public/js/state.js';
test('compact trims old per-session detail but keeps what charts read', () => {
  const st = { sessions: Array.from({ length: 400 }, (_, i) => sess(i + 1, { by: Object.fromEntries(IDS.map((k) => [k, [5, 5, 9.123456]])), lv: Object.fromEntries(IDS.map((k) => [k, 5.123])) })) };
  const before = JSON.stringify(st).length;
  compact(st);
  assert.ok(JSON.stringify(st).length < before * 0.5, 'at least half the size');
  assert.ok(st.sessions[399].by && st.sessions[399 - KEEP_BY + 1].by && !st.sessions[399 - KEEP_BY].by);
  assert.ok(st.sessions[399 - KEEP_LV + 1].lv && !st.sessions[399 - KEEP_LV].lv);
  assert.equal(st.sessions[0].pts, 300);       // totals are never dropped
});

import { msProgress, records } from '../public/js/stats.js';
test('milestone progress uses the right units', () => {
  const c = { ls: 3, n: 340, mx: 4.5, mn: 4, dy: 0, sv: 10 };
  assert.deepEqual(msProgress('s7', c), { cur: 3, goal: 7 });
  assert.deepEqual(msProgress('a2', c), { cur: 340, goal: 1000 });
  assert.deepEqual(msProgress('l6', c), { cur: 450, goal: 600 });     // rating goals are in ×100 units
  assert.deepEqual(msProgress('l6', { ...c, mx: 9 }), { cur: 600, goal: 600 });
  assert.equal(msProgress('pf', c), null);
});
test('records are safe on an empty state', () => {
  replaceState(fresh());
  const r = records(); assert.equal(r.length, 6); assert.ok(r.every(([l, v]) => l && v));
});

test('a question cleared on one device does not come back from another (tombstones)', () => {
  const w = (at) => ({ q: '7 × 8', a: 56, sk: 'mul', box: 0, due: 0, at });
  const phone = mk({ u: 9, weak: {}, gone: { '7 × 8': 500 } });          // mastered at t=500
  const laptop = mk({ u: 3, weak: { '7 × 8': w(100) } });                // last missed at t=100, stale copy
  assert.deepEqual(Object.keys(mergeStates(phone, laptop).weak), [], 'cleared stays cleared');
  assert.deepEqual(Object.keys(mergeStates(laptop, phone).weak), [], 'order does not matter');
  const missedAgain = mk({ u: 4, weak: { '7 × 8': w(900) } });            // missed again after being cleared
  assert.deepEqual(Object.keys(mergeStates(phone, missedAgain).weak), ['7 × 8'], 'a newer miss wins over the tombstone');
});

test('forget / unforget round-trip', async () => {
  const { forget, unforget } = await import('../public/js/state.js');
  replaceState(fresh());
  S.weak['1 + 2'] = { q: '1 + 2', a: 3, sk: 'add', box: 0, due: 0, at: 1 };
  const w = S.weak['1 + 2'];
  forget('1 + 2');
  assert.ok(!S.weak['1 + 2'] && S.gone['1 + 2'] > 0);
  unforget('1 + 2', w);
  assert.ok(S.weak['1 + 2'] && !S.gone['1 + 2']);
});

test('migrate drops malformed notebook rows and sessions instead of crashing screens later', () => {
  const m = migrate({
    weak: { good: { q: 'g', a: 1, sk: 'add' }, bad1: { q: 'x', a: 1, sk: 'nope' }, bad2: null, bad3: { q: 'x' } },
    sessions: [{ t: 1, dur: 60, n: 10, ok: 'NaN', pts: null, tm: 'x' }, { t: 'x', dur: 60, n: 1 }, null, 5],
    cfg: { only: 'bogus', dur: 'abc' },
    gone: [],
  });
  assert.deepEqual(Object.keys(m.weak), ['good']);
  assert.equal(m.sessions.length, 1);
  assert.ok(Number.isFinite(m.sessions[0].ok) && Number.isFinite(m.sessions[0].pts) && Number.isFinite(m.sessions[0].tm));
  assert.equal(m.cfg.only, 'all'); assert.ok(m.cfg.dur >= 10);
  assert.deepEqual(m.gone, {});
});
