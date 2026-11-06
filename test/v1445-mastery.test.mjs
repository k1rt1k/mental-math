// v14.45: five-step spaced repetition, retained mastery history and lapse tracking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, replaceState, fresh, migrate, mergeStates } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { INTERVALS, MASTER_BOX, qk } from '../public/js/engine.js';
import { masteryStats as statsFor } from '../public/js/stats.js';
import { seeded } from '../public/js/util.js';

const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const weak = (over = {}) => ({ q: '2 + 2', a: 4, sk: 'add', d: 1, pt: 'no carry', tip: '', box: 0, due: 0, at: 1, ...over });

/** Answer the forced current question correctly after `ms` on the clock. */
function hit(s, c, p, ms = 100) {
  s.cur = { q: p.q, a: p.a, sk: p.sk, d: p.d, pt: p.pt, tip: p.tip || '', ...p };
  s.buf = ''; s.wrong = 0;
  s.qs = c.now(); c.adv(ms);
  for (const d of String(s.cur.a)) if (s.type(d) == 'ok') return s.answer(true);
  throw new Error('could not type the answer');
}

function session() {
  const c = clock(), s = new Session(undefined, { now: c.now, rand: seeded(3) });
  s.begin();
  return { c, s };
}

test('the four review gaps are exactly 10 minutes, 1 day, 3 days and 7 days', () => {
  assert.equal(MASTER_BOX, 5);
  assert.deepEqual(INTERVALS, [0, 10 * 60e3, 24 * 60 * 60e3, 3 * 24 * 60 * 60e3, 7 * 24 * 60 * 60e3]);
});

test('five fast first-try retrievals walk a question through every interval, then master it', () => {
  replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
  S.weak['2 + 2'] = weak();
  const { c, s } = session();
  const due = [];
  for (let step = 1; step <= 4; step++) {
    const before = Date.now(), out = hit(s, c, S.weak['2 + 2']);
    const w = S.weak['2 + 2'];
    assert.equal(out.mastered, false, 'not mastered before the fifth retrieval');
    assert.equal(w.box, step);
    assert.ok(w.due >= before + INTERVALS[step] - 5, 'scheduled after interval ' + step);
    assert.ok(w.due <= Date.now() + INTERVALS[step] + 5000, 'not scheduled later than interval ' + step);
    due.push(w.due);
  }
  const out = hit(s, c, S.weak['2 + 2']);
  assert.equal(out.mastered, true, 'the fifth retrieval confirms retention');
  assert.ok(!S.weak['2 + 2'], 'mastered questions leave active review');
  assert.ok(S.gone['2 + 2'] > 0, 'the tombstone still stops an old copy from reviving it');
  const m = S.mastered[qk('2 + 2')];
  assert.ok(m, 'mastery history is retained');
  assert.equal(m.box, MASTER_BOX);
  assert.equal(m.retrievals, MASTER_BOX);
  assert.equal(m.lapses, 0);
  assert.ok(m.masteredAt > 0 && m.firstMasteredAt > 0);
});

test('a slow, hinted, slipped or same-session-retry answer never advances mastery', () => {
  for (const bad of [{ ms: 30000 }, { tries: 1 }, { hinted: 1 }, { retry: 1 }]) {
    replaceState(fresh()); S.cfg = { dur: 0, only: 'add' };
    S.weak['2 + 2'] = weak({ box: 4 });
    const { c, s } = session();
    const out = hit(s, c, { ...S.weak['2 + 2'], ...(bad.tries ? { tries: 1 } : {}), ...(bad.hinted ? { hinted: 1 } : {}), ...(bad.retry ? { retry: 1 } : {}) }, bad.ms || 100);
    assert.equal(out.mastered, false);
    assert.equal(S.weak['2 + 2'].box, 4, 'stage stays put after ' + JSON.stringify(bad));
    assert.ok(!S.mastered['2+2'], 'not retired after ' + JSON.stringify(bad));
  }
});

test('a missed mastered question comes back at stage 0 and records one lapse, not one per retry', () => {
  replaceState(fresh());
  const key = qk('2 + 2');
  S.mastered[key] = { ...weak(), box: MASTER_BOX, masteredAt: 10, firstMasteredAt: 10, at: 10, lapses: 0, lastLapse: 0, retrievals: 5 };
  S.gone['2 + 2'] = 10;
  const { s } = session();
  s.cur = { ...weak(), box: MASTER_BOX };
  const out = s.answer(false);
  assert.equal(out.lapse, true);
  assert.equal(S.mastered[key].lapses, 1);
  assert.ok(S.mastered[key].lastLapse > 0);
  assert.equal(S.weak['2 + 2'].box, 0, 're-opened at the start of the progression');
  assert.ok(S.weak['2 + 2'].due <= Date.now() + 5, 'due immediately');
  s.cur = { ...weak(), box: MASTER_BOX };
  s.answer(false);
  assert.equal(S.mastered[key].lapses, 1, 'a second failure while it is already active is not a new lapse');
});

test('mastery and lapse history are order-insensitive and survive a sync merge', () => {
  const mastered = { ...weak(), box: MASTER_BOX, masteredAt: 50, firstMasteredAt: 50, at: 50, lapses: 2, lastLapse: 60, retrievals: 10 };
  const a = { ...fresh(), u: 9, mastered: { [qk('2 + 2')]: mastered }, gone: { '2 + 2': 50 } };
  const b = { ...fresh(), u: 3, weak: { '2 + 2': weak({ at: 10 }) } };
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.deepEqual(Object.keys(m.weak), [], 'a stale notebook copy cannot revive a mastered question');
    assert.ok(m.mastered[qk('2 + 2')], 'mastery history is kept');
    assert.equal(m.mastered[qk('2 + 2')].lapses, 2);
  }
  const lapseLater = { ...fresh(), u: 10, weak: { '2 + 2': weak({ at: 100 }) } };
  assert.deepEqual(Object.keys(mergeStates(a, lapseLater).weak), ['2 + 2'], 'a newer miss does re-open it');
});

test('migration keeps mastery history and clamps live stages to the new range', () => {
  const m = migrate({
    weak: { live: { q: '2 + 2', a: 4, sk: 'add', box: 99, due: 1, at: 2 } },
    mastered: { old: { q: '3 + 4', a: 7, sk: 'add', box: 3, masteredAt: 5, lapses: '2', retrievals: '1' } },
  });
  assert.equal(m.weak.live.box, MASTER_BOX - 1);
  const kept = m.mastered[qk('3 + 4')];
  assert.ok(kept, 'mastered rows survive migration');
  assert.equal(kept.box, MASTER_BOX);
  assert.equal(kept.lapses, 2);
  assert.equal(kept.retrievals, MASTER_BOX);
});

test('retention stats count mastered questions that slipped since', () => {
  const m = { ...fresh(), mastered: {
    'q1': { ...weak({ q: '1 + 1', a: 2 }), box: 5, masteredAt: 1, lapses: 0 },
    'q2': { ...weak(), box: 5, masteredAt: 1, lapses: 2, lastLapse: 9 },
  } };
  replaceState(m);
  assert.deepEqual(statsFor(), { mastered: 2, slipped: 1, retained: 1, lapses: 2, rate: 0.5 });
});

test('Notebook and Progress expose the five steps and retained mastery', () => {
  const nb = readFileSync(new URL('../public/js/views/notebook.js', import.meta.url), 'utf8');
  const pg = readFileSync(new URL('../public/js/views/progress.js', import.meta.url), 'utf8');
  for (const s of ['10 minutes', '1 day', '3 days', '7 days', 'MASTER_BOX', 'nbRelearn', 'Mastered']) assert.match(nb, new RegExp(s.replace(' ', '\\s+')));
  assert.match(pg, /masteryStats\(\)/);
  assert.match(pg, /statB\('retention'\)/);
});
