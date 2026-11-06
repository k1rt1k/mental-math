// v14.46: delayed-recall analytics. Questions answered cleanly at first practice and again at
// least seven days later form one paired cohort, so initial accuracy and 7-day retention describe
// exactly the same questions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, replaceState, fresh, migrate, mergeStates, recordRecall, trimRecall, RECALL_GAP, RECALL_MAX } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { qk } from '../public/js/engine.js';
import { retentionStats } from '../public/js/stats.js';
import { seeded } from '../public/js/util.js';

const BASE = 1_700_000_000_000;
const clock = (start = BASE) => { let t = start; return { now: () => t, adv: (ms) => (t += ms) }; };

function session(start = BASE) {
  const c = clock(start), s = new Session(undefined, { now: c.now, wall: c.now, rand: seeded(3) });
  s.begin();
  return { c, s };
}

/** Put a known question in front of the session without going through question selection. */
function ask(s, p) {
  s.cur = { q: '6 + 7', a: 13, sk: 'add', d: 1, pt: 'no carry', tip: '', ...p };
  s.buf = ''; s.wrong = 0; s.qs = s.now();
  return s;
}

test('the first clean answer is the baseline and the first clean answer after seven days is delayed recall', () => {
  replaceState(fresh());
  const q = '47 + 38', k = qk(q);
  assert.equal(recordRecall(q, true, BASE), 'baseline');
  assert.deepEqual(S.recall[k], { q, t0: BASE, ok0: 1, t1: 0, ok1: 0 });
  assert.equal(recordRecall(q, true, BASE + RECALL_GAP - 1), '', 'six days and 23 hours is not a 7-day recall');
  assert.equal(S.recall[k].t1, 0);
  assert.equal(recordRecall(q, true, BASE + RECALL_GAP), 'delayed');
  assert.equal(S.recall[k].t1, BASE + RECALL_GAP);
  assert.equal(S.recall[k].ok1, 1);
  assert.equal(recordRecall(q, false, BASE + RECALL_GAP + 1), '', 'a completed pair is stable');
  assert.equal(S.recall[k].ok1, 1);
  assert.equal(recordRecall('', true, BASE), '', 'an empty question is ignored');
  assert.equal(recordRecall('1 + 1', true, 0), '', 'a zero timestamp cannot be a real baseline');
});

test('only clean answers are recorded, and commutative questions share one row', () => {
  replaceState(fresh());
  assert.equal(recordRecall('47 + 38', true, BASE, false), '', 'a hinted or retried answer is not a fair test');
  assert.deepEqual(S.recall, {});
  assert.equal(recordRecall('47 + 38', false, BASE), 'baseline');
  assert.equal(recordRecall('38 + 47', true, BASE + RECALL_GAP), 'delayed');
  assert.equal(Object.keys(S.recall).length, 1, '3+5 and 5+3 are the same question');
  assert.equal(S.recall[qk('47 + 38')].ok0, 0);
  assert.equal(S.recall[qk('47 + 38')].ok1, 1);
});

test('Session records clean first tries, review prompts and skips, but not hints, slips or retries', () => {
  const q = '6 + 7', k = qk(q);

  // baseline then delayed recall through the real answer path
  {
    replaceState(fresh());
    const { c, s } = session();
    ask(s, { q, a: 13 }).answer(true);
    assert.equal(S.recall[k].ok0, 1);
    assert.equal(S.recall[k].t1, 0);
    c.adv(RECALL_GAP);
    ask(s, { q, a: 13 }).answer(false);
    assert.equal(S.recall[k].t1, c.now());
    assert.equal(S.recall[k].ok1, 0, 'the delayed attempt was a skip');
  }

  // A hint is ignored, not counted as a failure; a slip and a same-session retry are not clean either.
  for (const bad of [{ hinted: 1 }, { tries: 1 }, { retry: 1 }]) {
    replaceState(fresh());
    const { s } = session();
    ask(s, { q, a: 13, ...bad }).answer(true);
    assert.equal(S.recall[k], undefined, 'no baseline for ' + JSON.stringify(bad));
  }

  // A review question (`rt`) is a real spaced retrieval and does count.
  {
    replaceState(fresh());
    const { s } = session();
    ask(s, { q, a: 13, rt: 1 }).answer(true);
    assert.equal(S.recall[k].ok0, 1);
  }
});

test('retention stats compare the same paired questions and ignore pending baselines', () => {
  replaceState(fresh());
  const row = (q, t0, ok0, t1, ok1) => { S.recall[qk(q)] = { q, t0, ok0, t1, ok1 }; };
  row('1 + 1', BASE, 1, BASE + RECALL_GAP, 1);       // right both times
  row('2 + 2', BASE, 1, BASE + RECALL_GAP, 0);       // learned, then forgotten
  row('3 + 3', BASE, 0, BASE + RECALL_GAP, 1);       // missed at first, recalled later
  row('4 + 4', BASE, 0, BASE + RECALL_GAP, 0);       // missed both times
  row('5 + 5', BASE, 1, 0, 0);                       // waiting for its 7-day recall

  const r = retentionStats();
  assert.equal(r.cohort, 4, 'only questions with both observations are in the cohort');
  assert.equal(r.pending, 1);
  assert.equal(r.initial, 2);
  assert.equal(r.retained, 2);
  assert.equal(r.initialRate, 0.5);
  assert.equal(r.retentionRate, 0.5);
  assert.equal(r.forgot, 1);
  assert.equal(r.recovered, 1);

  replaceState(fresh());
  assert.deepEqual(retentionStats(), { cohort: 0, pending: 0, initial: 0, retained: 0, initialRate: 0, retentionRate: 0, forgot: 0, recovered: 0 });
});

test('migration sanitises the recall ledger and drops rows that cannot be a 7-day pair', () => {
  const m = migrate({
    recall: {
      a: { q: '2 + 2', t0: BASE, ok0: 1, t1: BASE + 1, ok1: 1 },              // less than 7 days: becomes a pending baseline
      b: { q: '3 + 3', t0: BASE, ok0: '1', t1: BASE + RECALL_GAP, ok1: '0' }, // valid, numeric strings coerced
      c: { q: '4 + 4', t0: 0, ok0: 1 },                                       // no baseline
      d: 'nope',                                                              // corrupt
      e: { q: '5 + 5', t0: BASE, ok0: 0, t1: BASE + RECALL_GAP, ok1: 1 },
    },
  });
  assert.deepEqual(Object.keys(m.recall).sort(), [qk('2 + 2'), qk('3 + 3'), qk('5 + 5')]);
  assert.equal(m.recall[qk('2 + 2')].t1, 0, 'an early repeat is not counted as delayed recall');
  assert.equal(m.recall[qk('2 + 2')].ok0, 1);
  assert.equal(m.recall[qk('3 + 3')].ok0, 1);
  assert.equal(m.recall[qk('3 + 3')].t1, BASE + RECALL_GAP);
  assert.equal(m.recall[qk('3 + 3')].ok1, 0);
  assert.equal(m.recall[qk('5 + 5')].ok1, 1);

  // Two spellings of the same question collapse to one row, keeping the earliest baseline.
  const dup = migrate({ recall: {
    '2+2': { q: '2 + 2', t0: BASE, ok0: 1, t1: 0, ok1: 0 },
    '2 + 2': { q: '2 + 2', t0: BASE + 10, ok0: 0, t1: 0, ok1: 0 },
  } });
  assert.equal(Object.keys(dup.recall).length, 1);
  assert.equal(dup.recall[qk('2 + 2')].t0, BASE);
  assert.equal(dup.recall[qk('2 + 2')].ok0, 1);
});

test('the recall ledger merges as a union and never double-counts a question', () => {
  const pending = { q: '2 + 2', t0: BASE, ok0: 1, t1: 0, ok1: 0 };
  const complete = { q: '2 + 2', t0: BASE - 1000, ok0: 0, t1: BASE + RECALL_GAP, ok1: 1 };
  const a = { ...fresh(), u: 9, recall: { [qk('2 + 2')]: pending } };
  const b = { ...fresh(), u: 3, recall: {
    [qk('2 + 2')]: complete,
    [qk('3 + 3')]: { q: '3 + 3', t0: BASE, ok0: 1, t1: 0, ok1: 0 },
  } };
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.equal(Object.keys(m.recall).length, 2);
    assert.equal(m.recall[qk('2 + 2')].t0, BASE - 1000, 'a completed pair is kept as one whole observation');
    assert.equal(m.recall[qk('2 + 2')].ok1, 1);
    assert.equal(m.recall[qk('3 + 3')].ok0, 1);
  }

  // With no completed pair, the earliest baseline wins, in either merge direction.
  const early = { ...fresh(), u: 9, recall: { [qk('2 + 2')]: { q: '2 + 2', t0: BASE - 500, ok0: 0, t1: 0, ok1: 0 } } };
  const late = { ...fresh(), u: 3, recall: { [qk('2 + 2')]: pending } };
  for (const m of [mergeStates(early, late), mergeStates(late, early)]) {
    assert.equal(m.recall[qk('2 + 2')].t0, BASE - 500);
    assert.equal(m.recall[qk('2 + 2')].ok0, 0);
  }
});

test('the ledger is capped, dropping oldest pending baselines before completed pairs', () => {
  replaceState(fresh());
  for (let i = 0; i < RECALL_MAX; i++) S.recall['p' + i] = { q: 'q' + i, t0: BASE + i, ok0: 1, t1: 0, ok1: 0 };
  for (let i = 0; i < 10; i++) { S.recall['p' + i].t1 = BASE + i + RECALL_GAP; S.recall['p' + i].ok1 = 1; }
  S.recall.extra = { q: 'extra', t0: BASE + 9999, ok0: 1, t1: 0, ok1: 0 };

  trimRecall();
  assert.equal(Object.keys(S.recall).length, RECALL_MAX);
  assert.ok(!S.recall.p10, 'the oldest pending baseline is dropped first');
  assert.ok(S.recall.extra, 'the newest pending baseline stays');
  for (let i = 0; i < 10; i++) assert.ok(S.recall['p' + i], 'completed pairs survive');
});

test('Progress shows the paired metric, keeps the mastery line and explains the cohort', () => {
  const pg = readFileSync(new URL('../public/js/views/progress.js', import.meta.url), 'utf8');
  assert.match(pg, /retentionStats\(\)/);
  assert.match(pg, /RETENTION_MIN/);
  assert.match(pg, /7-day retention/);
  assert.match(pg, /Initial accuracy/);
  assert.match(pg, /question pairs/);
  assert.match(pg, /statB\('retention'\)/);
  assert.match(pg, /masteryStats\(\)/);

  const info = readFileSync(new URL('../public/js/infotext.js', import.meta.url), 'utf8');
  assert.match(info, /7-day retention/);
  assert.match(info, /first-try and unhinted/);
  assert.match(info, /Five question pairs/);
});
