import test from 'node:test';
import assert from 'node:assert/strict';
import { S, replaceState, fresh, migrate } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { seeded } from '../public/js/util.js';

const mk = (opt, cfg) => new Session(opt, { now: () => 0, rand: seeded(9), cfg });

test('a per-run config override changes the run but never the saved setup', () => {
  replaceState(fresh()); S.cfg = { dur: 60, only: 'mul', off: 1.5 };
  const before = JSON.stringify(S.cfg);
  const s = mk(undefined, { only: 'add', dur: 120, off: 0 });
  assert.equal(s.only, 'add'); assert.equal(s.dur, 120); assert.equal(s.off, 0);
  for (let i = 0; i < 10; i++) { s.next(); assert.equal(s.cur.sk, 'add'); }
  assert.equal(JSON.stringify(S.cfg), before, 'saved config was modified');
});

test('a drill keeps your saved length and difficulty, and a pattern override replaces any saved pattern', () => {
  replaceState(fresh()); S.cfg = { dur: 300, only: 'all', off: 0, patt: '×11 trick' };
  const s = mk(undefined, { only: 'sq', patt: undefined });
  assert.equal(s.dur, 300); assert.equal(s.only, 'sq'); assert.equal(s.patt, null);
  const t = mk(undefined, { only: 'mul', patt: '×25 trick' });
  assert.equal(t.patt, '×25 trick');
});

test('without an override the saved config is used as before', () => {
  replaceState(fresh()); S.cfg = { dur: 60, only: 'div' };
  const s = mk();
  assert.equal(s.only, 'div'); assert.equal(s.dur, 60); assert.equal(s.kind, 'focus');
});

test('a pattern drill saved by an older version is dropped on load, so Start no longer replays it', () => {
  const o = migrate({ cfg: { dur: 120, only: 'mul', patt: '×11 trick' } });
  assert.equal(o.cfg.patt, undefined); assert.equal(o.cfg.only, 'mul');
});

test('review sessions know their length for the "3 of 12" label', () => {
  replaceState(fresh());
  for (let i = 0; i < 30; i++) S.weak['1 + ' + i] = { q: '1 + ' + i, a: 1 + i, sk: 'add', d: 3, pt: 'no carry', tip: '', box: 0, due: 0, at: 1 };
  assert.equal(mk('review').total, 20);
  replaceState(fresh()); S.weak['2 + 2'] = { q: '2 + 2', a: 4, sk: 'add', d: 1, pt: '', tip: '', box: 0, due: 0, at: 1 };
  assert.equal(mk('review').total, 1);
  assert.equal(mk().total, 0);
});
