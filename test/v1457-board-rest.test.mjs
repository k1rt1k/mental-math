import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueAdd, queueClean, queueDrop, rankChange, moveText, rankLine, QUEUE_MAX } from '../public/js/boardlogic.js';
import { restView, restChip } from '../public/js/rest.js';
const rd = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const T = '2026-11-07';

test('queue: one entry per day, best points win, old days expire, junk is dropped', () => {
  let q = queueAdd([], { day: T, pts: 40, n: 10, ok: 8 }, T);
  q = queueAdd(q, { day: T, pts: 30, n: 9, ok: 7 }, T);
  assert.deepEqual(q, [{ day: T, pts: 40, n: 10, ok: 8 }]);
  q = queueAdd(q, { day: T, pts: 55.4, n: 12, ok: 11 }, T);
  assert.equal(q[0].pts, 55);
  q = queueAdd(q, { day: '2026-11-06', pts: 10, n: 2, ok: 2 }, T);
  assert.equal(q.length, 2);
  assert.equal(queueClean(q, '2026-11-09').length, 1);          // two days on, the 6th is out of reach for the server
  assert.equal(queueClean(q, '2026-11-10').length, 0);
  assert.deepEqual(queueClean([null, { day: 'x' }, { day: T, pts: 'a', n: 1, ok: 1 }, 5], T), []);
  assert.deepEqual(queueClean('nope', T), []);
  assert.deepEqual(queueDrop(q, T).map((x) => x.day), ['2026-11-06']);
  let many = []; for (let i = 0; i < 9; i++) many = queueAdd(many, { day: T, pts: i, n: 1, ok: 1 }, T);
  assert.ok(many.length <= QUEUE_MAX);
});

const row = (name, pts, you = false) => ({ name, pts, n: 10, ok: 8, you });
test('rankChange: passing people, first listing, no change, not on the board', () => {
  const before = [row('Maya', 90), row('Sam', 70), row('Ana', 50, true), row('Ben', 20)];
  const after = [row('Maya', 90), row('Ana', 80, true), row('Sam', 70), row('Ben', 20)];
  const m = rankChange(before, after);
  assert.deepEqual(m, { rank: 2, prev: 3, up: 1, passed: ['Sam'], first: false });
  assert.equal(moveText(m), 'You passed Sam · up 1 place to #2');
  const top = rankChange(before, [row('Ana', 120, true), row('Maya', 90), row('Sam', 70), row('Ben', 20)]);
  assert.deepEqual(top.passed, ['Maya', 'Sam']); assert.equal(top.first, true);
  assert.equal(moveText(top), 'You passed Maya and Sam. You lead today');
  const fresh = rankChange([row('Maya', 90), row('Sam', 70)], [row('Maya', 90), row('Ana', 80, true), row('Sam', 70)]);
  assert.equal(fresh.prev, null); assert.deepEqual(fresh.passed, ['Sam']);
  assert.equal(moveText(fresh), 'You passed Sam. You are #2');
  assert.equal(moveText(rankChange([], [row('Ana', 5, true)])), 'You lead today');
  assert.equal(rankChange(before, before), null);                                  // same place: nothing to announce
  assert.equal(rankChange(before, [row('Maya', 90)]), null);                        // not on the board
  assert.equal(rankChange(before, [row('Maya', 90), row('Sam', 70), row('Ben', 60), row('Ana', 50, true)]), null);  // never announce a drop
  assert.equal(moveText(null), '');
});

test('rankLine reads today\'s place off the board', () => {
  assert.equal(rankLine({ board: [row('Maya', 9), row('Ana', 5, true)] }), 'Today you are #2 of 2.');
  assert.equal(rankLine({ board: [row('Maya', 9)] }), '');
  assert.equal(rankLine(null), '');
});

test('rest day: words and pips for each state', () => {
  assert.equal(restView(null), null);
  assert.deepEqual(restView({ state: 'ready', left: 0 }), { cls: 'ready', label: 'Rest day ready', full: 'Rest day ready: one missed day will be forgiven.', filled: 7 });
  assert.equal(restView({ state: 'using', left: 0 }).label, 'Rest day in use · play today');
  const e = restView({ state: 'earning', left: 3 });
  assert.equal(e.filled, 4); assert.equal(e.label, '4/7'); assert.match(e.full, /3 more days in a row earns a rest day/);
  assert.match(restView({ state: 'earning', left: 1 }).full, /1 more day in/);
  const esc = (s) => String(s); const icon = (n) => `<svg data-i="${n}"/>`;
  assert.equal(restChip(null, icon, esc), '');
  assert.equal((restChip({ state: 'earning', left: 3 }, icon, esc).match(/<i class="on">/g) || []).length, 4);
  assert.match(restChip({ state: 'ready', left: 0 }, icon, esc), /data-i="moon"/);
  assert.match(restChip({ state: 'using', left: 0 }, icon, esc), /aria-label="Your rest day is in use/);
});

test('restInfo feeds the chip: earning with days left, then ready', async () => {
  const { S } = await import('../public/js/state.js');
  const { restInfo } = await import('../public/js/stats.js');
  const { ymd, dayAgo } = await import('../public/js/util.js');
  const keep = S.sessions; const mk = (n) => Array.from({ length: n }, (_, i) => ({ t: dayAgo(i, dayAgo(0)) + 1000 * i, ok: 5, n: 5 }));
  try {
    S.sessions = mk(4); assert.deepEqual(restInfo(), { state: 'earning', left: 3 });
    S.sessions = mk(8); assert.equal(restInfo().state, 'ready');
    S.sessions = []; assert.equal(restInfo(), null);
  } finally { S.sessions = keep; }
});

test('the client queues before sending, flushes on boot and when back online, and forgets the queue on leave', () => {
  const b = rd('js/board.js'), m = rd('js/main.js');
  assert.match(b, /if \(!boardHint\(\)\) return null;/);
  assert.ok(b.indexOf('qWrite(queueAdd') < b.indexOf('await flushBoardQueue()'));          // saved first, sent second
  assert.match(b, /removeItem\(QKEY\)/);                                                     // leaving or switching learner drops unsent scores
  assert.match(b, /r\.status === 0 \|\| r\.status === 429\) break/);                         // offline or locked out: keep the rest for later
  assert.match(m, /addEventListener\('online', \(\) => \{ netState\(\); sendQueued\(\); \}\)/);
  assert.match(m, /setTimeout\(sendQueued/);
  const sw = rd('sw.js'); for (const f of ['js/boardlogic.js', 'js/rest.js']) assert.ok(sw.includes(`'${f}'`), f);
});

test('motion for the climb respects reduced motion, and Home and Progress show the rest chip', () => {
  const css = rd('css/extras.css');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.bmove, \.bmi/);
  assert.match(css, /\[data-motion=reduce\] \.bmove/);
  assert.match(rd('js/views/home.js'), /restChip\(rest, icon, esc\)/);
  assert.match(rd('js/views/progress.js'), /restChip\(restInfo\(\), icon, esc\)/);
});
