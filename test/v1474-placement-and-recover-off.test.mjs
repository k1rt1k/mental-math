// v14.74: the one-release RECOVER switch is off again, and a short placement quiz opens a Learn path at the right stage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fresh, S, replaceState, cleanPaths } from '../public/js/state.js';
import { PathSession, PlaceSession, PLACE, RULES, canPlace, applyPlacement, progress, recordCheck, logPathRun, stagesOf } from '../public/js/paths.js';
import { streak } from '../public/js/stats.js';
import { IDS } from '../public/js/engine.js';

const swSrc = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const viewSrc = readFileSync(new URL('../public/js/views/paths.js', import.meta.url), 'utf8');
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/* ---------- RECOVER ---------- */
test('RECOVER is off: an app update waits for the Update tap and never reloads open tabs', async () => {
  assert.match(swSrc, /const RECOVER = false;/);
  const calls = { skip: 0, nav: 0, claim: 0 }, h = {};
  const client = { url: 'https://x.test/', navigate: () => { calls.nav++; } };
  const ctx = {
    self: { addEventListener: (n, f) => { h[n] = f; }, skipWaiting: () => { calls.skip++; } },
    location: { origin: 'https://x.test' }, URL, Response: { error: () => ({}) },
    Request: class { constructor(u) { this.url = u; } },
    clients: { claim: async () => { calls.claim++; }, matchAll: async () => [client] },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => ['mm-v14-73', 'mm-v14-74'], delete: async () => true, match: async () => undefined },
    fetch: async () => ({ ok: true }),
  };
  vm.createContext(ctx); vm.runInContext(swSrc, ctx);
  const w = []; h.install({ waitUntil: (p) => w.push(p) }); await Promise.all(w);
  assert.equal(calls.skip, 0, 'installing does not skip waiting');
  const a = []; h.activate({ waitUntil: (p) => a.push(p) }); await Promise.all(a);
  assert.equal(calls.nav, 0, 'activating does not navigate any open tab');
  h.message({ data: { type: 'skipWaiting' } });
  assert.equal(calls.skip, 1, 'the Update tap still works');
});

/* ---------- placement ---------- */
/** Run a placement, answering each question right (true) or wrong (false) from `script`, in order; anything past the script is right. */
function place(k, from, script = [], seed = 7) {
  let t = 0;
  const s = new PlaceSession(k, from, { now: () => t, rand: seeded(seed) });
  s.begin();
  const seen = [];
  for (let i = 0; !s.finished; i++) {
    assert.ok(i < 40, 'a placement always ends');
    assert.ok(s.next());
    seen.push(s.stg.t); t += 4000;
    s.record(script[i] !== false);
  }
  return { s, seen };
}

test('the quiz climbs three questions per stage and ends at 12 when everything is right', () => {
  for (const k of IDS) {
    replaceState(fresh());
    const { s, seen } = place(k, 0);
    assert.equal(s.rows.length, PLACE.per * (PLACE.last + 1), k + ': 12 questions');
    assert.equal(s.probe, PLACE.last + 1, k + ': cleared every stage before the mastery test');
    for (let i = 0; i < 4; i++) assert.equal(seen.slice(i * 3, i * 3 + 3).every((x) => x == stagesOf(k)[i].t), true, `${k}: questions ${i * 3 + 1}-${i * 3 + 3} come from stage ${i + 1}`);
    assert.ok(RULES.place().hints === false && RULES.place().need == PLACE.per);
  }
});

test('one miss ends the quiz and the learner starts at that stage', () => {
  replaceState(fresh());
  const a = place('mul', 0, [true, true, true, true, false]);       // clears stage 1, misses on the second question of stage 2
  assert.equal(a.s.probe, 1); assert.equal(a.s.rows.length, 5);
  const b = place('mul', 0, [false]);
  assert.equal(b.s.probe, 0); assert.equal(b.s.rows.length, 1);
  const c = place('mul', 0, [true, true, true, true, true, true, true, true, true, false]);
  assert.equal(c.s.probe, 3);
});

test('a hinted answer or a corrected slip does not clear a stage', () => {
  replaceState(fresh());
  let t = 0;
  const s = new PlaceSession('add', 0, { now: () => t, rand: seeded(3) });
  s.begin(); s.next(); s.cur.hinted = true; t += 3000; s.record(true);
  assert.ok(s.finished); assert.equal(s.probe, 0);
  const u = new PlaceSession('add', 0, { now: () => t, rand: seeded(3) });
  u.begin(); u.next(); u.cur.tries = 1; t += 3000; u.record(true);
  assert.ok(u.finished); assert.equal(u.probe, 0);
});

test('applying a placement opens the path at the right stage and never touches the mastery test', () => {
  replaceState(fresh());
  const k = 'sub', now = 1e12;
  assert.equal(canPlace(k), true);
  assert.equal(applyPlacement(k, 0, 2, now), 2);
  let p = progress(k);
  assert.deepEqual(p.stages.map((x) => x.state), ['done', 'done', 'open', 'locked', 'locked']);
  assert.equal(p.cur, 2); assert.equal(p.stages[2].open, true); assert.equal(p.started, true);
  assert.equal(S.paths[k].st[0].ph, 3); assert.equal(S.paths[k].st[0].pass, now);
  // a full clear still leaves stage 5 and both retention checks to earn
  assert.equal(applyPlacement(k, 2, PLACE.last + 1, now), 2);
  p = progress(k);
  assert.equal(p.cur, 4); assert.equal(p.assessed, false); assert.equal(p.mastered, false);
  assert.equal(p.ret.every((r) => r.state == 'locked'), true);
  assert.equal(canPlace(k), false, 'the mastery test is next, and it is never placed out of');
  // even a call that asks for everything stops before the last stage
  replaceState(fresh());
  applyPlacement(k, 0, 99, now);
  assert.equal(S.paths[k].st[4].pass, 0); assert.equal(progress(k).cur, 4);
});

test('placement is only offered while a stage before the mastery test is open, and never undoes progress', () => {
  replaceState(fresh());
  assert.equal(canPlace('mul'), true);
  applyPlacement('mul', 0, 4, 1e12);                  // cur is now the mastery test
  assert.equal(canPlace('mul'), false, 'nothing left to place');
  recordCheck('mul', 4, 'test', { pass: true, n: 12, correct: 12 }, 2e12);
  assert.equal(canPlace('mul'), false, 'assessed paths do not offer it');
  // earlier pass times and best scores survive a later placement
  replaceState(fresh());
  recordCheck('add', 0, 'check', { pass: true, n: 5, correct: 4 }, 5e11);
  const before = { ...S.paths.add.st[0] };
  const s = place('add', progress('add').cur).s;
  applyPlacement('add', s.from, s.probe, 9e11);
  assert.equal(S.paths.add.st[0].pass, before.pass); assert.equal(S.paths.add.st[0].sc, before.sc);
  assert.equal(s.from, 1, 'a quiz starts at the first stage not yet passed');
  assert.equal(s.cap, 9);
});

test('a placement counts as a path run for the streak, leaves ratings alone, and the result survives saving', () => {
  replaceState(fresh());
  const ratings = JSON.stringify(S.sk), { s } = place('pct', 0);
  const lg = logPathRun(s, true);
  assert.equal(lg.rec.m, 'path'); assert.equal(lg.rec.ps, 'pct'); assert.equal(lg.rec.n, 12);
  assert.equal(streak(), 1); assert.equal(JSON.stringify(S.sk), ratings);
  applyPlacement('pct', s.from, s.probe, 1e12);
  const clean = cleanPaths(JSON.parse(JSON.stringify(S.paths)));
  assert.equal(clean.pct.st.slice(0, 4).every((x) => x.pass > 0 && x.ph == 3), true);
  assert.equal(clean.pct.st[4].pass, 0);
});

test('a quiz that is left early after clearing stages still keeps what it proved', () => {
  replaceState(fresh());
  // a half-finished quiz: two stages cleared, then leave
  let t = 0;
  const h = new PlaceSession('div', 0, { now: () => t, rand: seeded(11) });
  h.begin();
  for (let i = 0; i < 7; i++) { h.next(); t += 3000; h.record(true); }
  assert.equal(h.probe, 2); assert.equal(h.finished, false);
  assert.equal(applyPlacement('div', h.from, h.probe, 1e12), 2);
  assert.equal(progress('div').cur, 2);
  assert.ok(logPathRun(h, false), 'seven answers is enough to count when leaving early');
});

/* ---------- wiring ---------- */
test('the path map offers the quiz through a registered action', () => {
  assert.match(viewSrc, /data-act="placeStart"/);
  assert.match(viewSrc, /A\.placeStart = /);
  assert.match(viewSrc, /canPlace\(k\) \? placeCard\(p\)/);
  assert.match(viewSrc, /ctx\.res\.place\) return placeResult\(\)/);
  assert.equal(PathSession.prototype.isPrototypeOf(PlaceSession.prototype), true);
});
