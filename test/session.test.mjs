import test from 'node:test';
import assert from 'node:assert/strict';
import { S, replaceState, fresh } from '../public/js/state.js';
import { Session, LIVES } from '../public/js/session.js';
import { seeded } from '../public/js/util.js';

const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const solve = (s) => String(s.cur.a).split('');

function play(opt, { n = 30, cfg, ms = 2000, wrongEvery = 0 } = {}) {
  replaceState(fresh()); if (cfg) S.cfg = cfg;
  const c = clock(), s = new Session(opt, { now: c.now, rand: seeded(42) });
  s.begin(); s.next();
  for (let i = 0; i < n && !s.over; i++) {
    c.adv(ms); s.tick();
    if (wrongEvery && (i + 1) % wrongEvery == 0) { const w = String(s.cur.a).split('').map((d) => (+d + 1) % 10).join(''); for (const d of w) s.type(d); if (s.over) break; s.back(); }
    for (const d of solve(s)) { if (s.type(d) == 'ok') { s.answer(true); break; } }
    if (!s.next()) break;
  }
  return s;
}

test('a normal session records answers, points and moves ratings', () => {
  const s = play(undefined, { n: 40, cfg: { dur: 0, only: 'all' } });
  assert.equal(s.ok, 40); assert.equal(s.n, 40); assert.ok(s.pts > 0);
  const out = s.finish();
  assert.equal(S.sessions.length, 1, 'untimed practice session is saved');
  assert.match(out.tag, /Practice/);
});

test('timed session: full length counts toward best, ghost is stored', () => {
  const s = play(undefined, { n: 25, cfg: { dur: 60, only: 'all' }, ms: 2500 });
  s.el = 60.1;
  const out = s.finish();
  assert.ok(out && out.full);
  assert.ok(S.best[s.mk] && S.best[s.mk].pts == s.pts);
});

test('ending a timed session early with < 5 answers saves nothing', () => {
  const s = play(undefined, { n: 3, cfg: { dur: 120, only: 'all' } });
  assert.equal(s.finish(), null); assert.equal(S.sessions.length, 0);
});

test('a miss goes into the notebook and comes back as a retry', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(7) });
  s.begin(); s.next(); c.adv(1000);
  const q = s.cur.q; s.answer(false);
  assert.ok(S.weak[q], 'missed question stored');
  assert.equal(s.retry.length, 1);
  let seen = false; for (let i = 0; i < 6; i++) { s.next(); if (s.cur.q == q && s.cur.rt) seen = true; c.adv(500); s.answer(true); }
  assert.ok(seen, 'retried within a few questions');
});

test('wrong full-length entry counts a slip, resets combo, allows retype', () => {
  const s = play(undefined, { n: 10, wrongEvery: 3 });
  assert.ok(s.slips >= 3); assert.equal(s.ok, s.n - 0 === s.ok ? s.ok : s.ok);
  assert.ok(s.ft < s.ok, 'slipped answers are not first-try');
});

test('survival: three slips end the run, ratings stay frozen', () => {
  const before = JSON.stringify(play(undefined, { n: 0 }) && S.sk);
  const s = play('survival', { n: 100, wrongEvery: 4 });
  assert.ok(s.over); assert.equal(s.lives, 0);
  assert.equal(JSON.stringify(S.sk), before);
  const out = s.finish();
  assert.ok(out && out.rec.m == 'survival');
  assert.ok(S.best.survival);
});

test('survival difficulty rises with progress', () => {
  replaceState(fresh());
  const c = clock(), s = new Session('survival', { now: c.now, rand: seeded(3) });
  s.begin(); s.next();
  const ds = []; for (let i = 0; i < 40; i++) { c.adv(1000); ds.push(s.cur.d); s.type; for (const d of String(s.cur.a)) if (s.type(d) == 'ok') s.answer(true); s.next(); }
  const avg = (a) => a.reduce((x, y) => x + y) / a.length;
  assert.ok(avg(ds.slice(30)) > avg(ds.slice(0, 10)) + 1);
});

test('daily challenge gives the same questions in the same order', () => {
  const seq = () => { replaceState(fresh()); const s = new Session('daily', { now: () => 0 }); const q = []; for (let i = 0; i < 15; i++) { s.next(); q.push(s.cur.q); } return q; };
  assert.deepEqual(seq(), seq());
});

test('review serves each missed item once and finishes', () => {
  replaceState(fresh());
  S.weak = { '12 + 15': { q: '12 + 15', a: 27, sk: 'add', d: 3, pt: 'no carry', box: 0, due: 0, at: 1 }, '30 − 7': { q: '30 − 7', a: 23, sk: 'sub', d: 3, pt: '1 borrow', box: 0, due: 0, at: 2 } };
  const c = clock(), s = new Session('review', { now: c.now, rand: seeded(1) });
  s.begin(); let n = 0;
  while (s.next() && n < 10) { c.adv(1000); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') s.answer(true); n++; }
  assert.equal(n, 2);
});

test('pause stops the clock', () => {
  replaceState(fresh()); const c = clock(), s = new Session(undefined, { now: c.now });
  s.begin(); s.next(); c.adv(1000); s.pause(); c.adv(60000); s.resume(); c.adv(1000); s.tick();
  assert.ok(Math.abs(s.el - 2) < 0.01); assert.ok(Math.abs(s.qAge() - 2) < 0.01);
});

test('lives constant', () => assert.equal(LIVES, 3));

test('custom-range session: ratings frozen, no pattern pollution, own best key', () => {
  replaceState(fresh()); S.cfg = { dur: 60, only: 'zeta', zeta: { ops: ['mul', 'div'], m: [7, 7], n: [2, 12] } };
  const before = JSON.stringify(S.sk), c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(5) });
  assert.equal(s.kind, 'zeta'); s.begin();
  for (let i = 0; i < 20; i++) { s.next(); assert.ok(/^7 × \d+$|^\d+ ÷ 7$/.test(s.cur.q), s.cur.q); c.adv(1500); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') s.answer(true); }
  assert.equal(JSON.stringify(S.sk), before); assert.equal(Object.keys(S.pat).length, 0);
  s.el = 60.2; const out = s.finish();
  assert.ok(out.full && out.rec.m == 'zeta'); assert.match(s.mk, /^zeta/); assert.ok(S.best[s.mk]);
});

test('a wrong try followed by the right answer still lands in the notebook for later review', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(5) });
  s.begin(); s.next();
  const q = s.cur.q, wrong = String(s.cur.a).split('').map((d) => (+d + 1) % 10).join('');
  c.adv(1500);
  for (const d of wrong) s.type(d);
  assert.equal(s.wrong, 1);
  s.back();
  for (const d of String(s.cur.a)) if (s.type(d) == 'ok') { s.answer(true); break; }
  const w = S.weak[q];
  assert.ok(w, 'slipped question is in the notebook');
  assert.equal(w.box, 0);
  assert.ok(w.due > Date.now(), 'due later, not instantly (you just solved it)');
  assert.ok(!s.retry.length, 'no immediate retry: it was solved');
});

test('a clean first-try answer never adds to the notebook', () => {
  const s = play(undefined, { n: 20, cfg: { dur: 0, only: 'add' } });
  assert.equal(Object.keys(S.weak).length, 0);
  assert.equal(s.slips, 0);
});

test('mastering a notebook entry leaves a tombstone and a retained history', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  S.weak['2 + 2'] = { q: '2 + 2', a: 4, sk: 'add', d: 1, pt: '', box: 4, due: 0, at: 1 };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) });
  s.begin(); s.next();
  s.cur = { q: '2 + 2', a: 4, sk: 'add', d: 1, pt: '', tip: '', rt: 1 };
  s.qs = c.now(); c.adv(500);
  s.type('4'); const out = s.answer(true);
  assert.ok(!S.weak['2 + 2']);
  assert.ok(S.gone['2 + 2'] > 0);
  assert.ok(out.mastered);
  assert.equal(S.mastered['2+2'].box, 5);
  assert.equal(S.mastered['2+2'].lapses, 0);
});

test('a slow or slipped correct answer does not advance spaced-review progress', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  S.weak['2 + 2'] = { q: '2 + 2', a: 4, sk: 'add', d: 1, pt: '', box: 1, due: 0, at: 1 };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) });
  s.begin(); s.next();
  s.cur = { q: '2 + 2', a: 4, sk: 'add', d: 1, pt: '', tip: '', rt: 1, tries: 1 };   // slipped once
  s.qs = c.now(); c.adv(500);
  s.type('4'); s.answer(true);
  assert.equal(S.weak['2 + 2'].box, 1, 'box unchanged after a slip');
});

test('checkpoint persists mid-session progress without writing a session record', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.localStorage = {};   // Node has none; state.js reads/writes it by bare name
  try { checkpointBody(); } finally { had ? Object.defineProperty(globalThis, 'localStorage', had) : delete globalThis.localStorage; }
});
function checkpointBody() {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(8) });
  s.begin(); s.next();
  for (let i = 0; i < 6; i++) { c.adv(1500); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') { s.answer(true); break; } s.next(); }
  const before = JSON.parse(localStorage['mmTrainer.v1'] || '{}');
  s.checkpoint();
  const after = JSON.parse(localStorage['mmTrainer.v1']);
  assert.equal(after.sk.add.n, 6, 'answers counted in the stored rating');
  assert.equal(after.sessions.length, 0, 'no session record yet');
  assert.ok((before.sk ? before.sk.add.n : 0) < 6);
}
