import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { S, replaceState, fresh, mergeStates } from '../public/js/state.js';
import { todayCount, hourStats, recommend, plan } from '../public/js/stats.js';

const src = (f) => fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');
const at = (h, d = 0) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 5, 0, 0); return x.getTime(); };
const sess = (t, extra = {}) => ({ t, m: 'train', dur: 120, n: 20, ok: 18, pts: 600, tm: 3, ...extra });

test('todayCount: one definition for Home, the plan and the recommendation', () => {
  replaceState(fresh());
  S.sessions = [sess(at(9)), sess(at(10), { dur: 60 }), sess(at(11), { ok: 0 }), sess(at(12, 1))];
  assert.equal(todayCount(), 1, 'only a 2-minute session with a correct answer, today');
  assert.equal(plan().find((p) => p.id == 'train').detail, '1/2');
  assert.match(recommend().why, /1 of 2 sessions done today/);
});

test('hourStats: needs 3 sessions per slot, picks the fastest slot', () => {
  replaceState(fresh());
  S.sessions = [0, 1, 2].map((i) => sess(at(8, i + 1) + i, { pts: 500 })).concat([0, 1, 2].map((i) => sess(at(20, i + 1) + i, { pts: 900 })));
  const h = hourStats();
  assert.equal(h.rows.length, 4);
  assert.equal(h.best.l, 'Evening');
  assert.equal(h.rows.find((r) => r.l == 'Morning').s, 3);
  S.sessions = S.sessions.slice(0, 4);
  assert.equal(hourStats().best, null, 'not enough data in two slots: no verdict');
});

test('a 1 am session counts as night, not morning', () => {
  replaceState(fresh());
  S.sessions = [sess(at(1))];
  assert.equal(hourStats().rows.find((r) => r.l == 'Night').s, 1);
});

test('keypad layout syncs like every other setting: newest change wins, unset adopts', () => {
  const a = { ...fresh(), padFlip: true, u: 1 }, b = { ...fresh(), u: 2 };
  assert.equal(mergeStates(a, b).padFlip, true);        // no change times: this device keeps its own value
  assert.equal(mergeStates(b, a).padFlip, true);        // a device that never set it adopts the other's
  const c = { ...a, pt: { padFlip: 50 } }, d = { ...b, padFlip: false, pt: { padFlip: 90 } };
  assert.equal(mergeStates(c, d).padFlip, false);       // the later change wins from either side
  assert.equal(mergeStates(d, c).padFlip, false);
});

test('wiring: pagehide with a persisted page only pauses; progress has tabs; restart, notebook search, results delta exist', () => {
  assert.match(src('views/play.js'), /ev && ev\.persisted\) \{ sess\.checkpoint\(\); pause\(\)/);
  assert.match(src('main.js'), /addEventListener\(ev, \(e\) => flush\(e\)\)/);
  assert.match(src('views/progress.js'), /role="tab"/);
  assert.match(src('views/progress.js'), /A\.ptab/);
  assert.match(src('views/play.js'), /A\.restartRun/);
  assert.match(src('views/notebook.js'), /id="nbq"/);
  assert.match(src('views/results.js'), /vslast/);
  assert.match(src('views/settings.js'), /A\.padFlip/);
});
